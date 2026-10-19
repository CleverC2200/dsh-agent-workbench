"""Local, read-only configuration executor. Browser requests never contain SQL or credentials."""
import argparse
from functools import lru_cache
import datetime as dt
import decimal
import hashlib
import json
import pathlib
import re
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pymysql
import sqlglot
from sqlglot import exp
from sqlglot.optimizer.scope import traverse_scope

ROOT = pathlib.Path(__file__).resolve().parents[1]
AGENTS = ('aqkc', 'fc', 'qll', 'apsplan', 'dealer')


class ContractError(Exception):
    def __init__(self, code, message):
        self.code = code
        super().__init__(message)


def config_for(agent):
    if agent not in AGENTS:
        raise ContractError('AGENT_NOT_CONFIGURED', '未配置的 Agent')
    path = ROOT / 'business' / ('inventory-' + agent) / 'sql.config.json'
    data = json.loads(path.read_text())
    if data.get('schemaVersion') != 1 or data.get('agentId') != 'inventory-' + agent:
        raise ContractError('INVALID_AGENT_SQL_CONFIG', 'Agent SQL 配置身份不匹配')
    return data


def validate_parameters(query, values, query_id=''):
    if not isinstance(values, dict):
        raise ContractError('PARAMETER_MISMATCH', 'parameters 必须是业务参数对象')
    specs = query['parameterSpec']
    if set(values) != {spec['name'] for spec in specs.values()}:
        raise ContractError('PARAMETER_MISMATCH', '业务参数与配置不一致；不能指定 SQL、身份或数据源')
    parameters = {}
    for key, spec in specs.items():
        value = values[spec['name']]
        if value is None:
            valid = spec.get('nullable', False)
        else:
            valid = {
                'string': lambda: isinstance(value, str) and len(value) <= 600,
                'boolean': lambda: isinstance(value, bool),
                'integer': lambda: type(value) is int and abs(value) <= 9007199254740991,
                'array': lambda: isinstance(value, list) and 0 < len(value) <= 200 and
                    all(isinstance(item, str) and len(item) <= 255 for item in value),
            }.get(spec['type'], lambda: False)()
            if valid and 'enum' in spec:
                valid = value in spec['enum']
            if valid and 'minimum' in spec:
                valid = value >= spec['minimum']
            if valid and 'maximum' in spec:
                valid = value <= spec['maximum']
            fmt = spec.get('format')
            if valid and fmt in ('YYYY-MM-DD', 'YYYY-MM-01', 'YYYYMMDD', 'YYYYMM'):
                pattern = {'YYYY-MM-DD': r'\d{4}-\d{2}-\d{2}', 'YYYY-MM-01': r'\d{4}-\d{2}-01',
                           'YYYYMMDD': r'\d{8}', 'YYYYMM': r'\d{6}'}[fmt]
                try:
                    compact = value.replace('-', '') + ('01' if fmt == 'YYYYMM' else '')
                    valid = bool(re.fullmatch(pattern, value)) and dt.datetime.strptime(compact, '%Y%m%d') is not None
                except (TypeError, ValueError):
                    valid = False
        if not valid:
            raise ContractError('PARAMETER_TYPE_MISMATCH', '参数无效：' + spec['name'])
        parameters[key] = value
    for name, value in values.items():
        if name.endswith('_mode') and value == 'equal' and values.get(name[:-5]) is None:
            raise ContractError('PARAMETER_TYPE_MISMATCH', 'equal 筛选缺少业务值')
    for start, end in (('start', 'end_exclusive'), ('start_month', 'end_month_exclusive'),
                       ('delivery_start', 'delivery_end_exclusive')):
        if start in values and end in values and values[start] >= values[end]:
            raise ContractError('INVALID_PERIOD', '日期范围必须左闭右开')
    if 'stock_date' in values and values['stock_date'][:7] != values.get('stock_month', values['month'])[:7]:
        raise ContractError('INVALID_PERIOD', '库存日必须属于配置的库存月份')
    if query_id.startswith('orders.active_customers') and (
        values.get('date_basis') != 'created' or
        (dt.date.fromisoformat(values['end_exclusive']) - dt.date.fromisoformat(values['start'])).days != 30
    ):
        raise ContractError('INVALID_PERIOD', '活跃客户使用 created 近30日范围')
    if query_id.startswith(('plan_execution.', 'base_plan_execution.')):
        month = values['month']
        next_month = (dt.date.fromisoformat(month).replace(day=28) + dt.timedelta(days=4)).replace(day=1).isoformat()
        if values['delivery_start'] != month.replace('-', '') or not (
            values['delivery_start'] < values['delivery_end_exclusive'] <= next_month.replace('-', '')
        ):
            raise ContractError('INVALID_PERIOD', '计划执行须从月初起，截止日不能跨月')
        if query_id.startswith('plan_execution.') and (
            values['delivery_end_exclusive'] != values['order_end_exclusive'].replace('-', '') or
            not month < values['order_end_exclusive'] <= next_month
        ):
            raise ContractError('INVALID_PERIOD', '订单和交货截止日必须一致')
    return parameters


@lru_cache(maxsize=128)
def parsed_syntax(sql):
    # Syntax only: no credentials, parameters, schema, permissions or result rows.
    return tuple(sqlglot.parse(sql, read='postgres'))


def inspect(sql, parameters, schema):
    # Each request validates its own copied AST against current parameters/catalog.
    trees = [tree.copy() if tree is not None else None for tree in parsed_syntax(sql)]
    if len(trees) != 1 or not isinstance(trees[0], exp.Select):
        raise ContractError('READ_ONLY_QUERY_REQUIRED', '只允许配置中的单条只读 SELECT')
    tree = trees[0]
    if any(tree.find(kind) for kind in (exp.Insert, exp.Update, exp.Delete, exp.Merge, exp.Create, exp.Drop, exp.Alter)):
        raise ContractError('READ_ONLY_QUERY_REQUIRED', '禁止写入型 CTE、DDL 和业务写入')
    if tree.find(exp.Window) or tree.find(exp.Lock) or tree.find(exp.Into):
        raise ContractError('QUERY_FEATURE_NOT_SUPPORTED', '不支持窗口、锁或 SELECT INTO')
    tokens = sqlglot.Dialect.get_or_raise('postgres').tokenize(sql)
    if any(token.text.upper() in {'::', 'QUALIFY', 'LATERAL', 'RECURSIVE', 'NATURAL', 'USING'}
           and token.token_type not in {sqlglot.tokens.TokenType.STRING, sqlglot.tokens.TokenType.IDENTIFIER}
           for token in tokens):
        raise ContractError('QUERY_FEATURE_NOT_SUPPORTED', '查询超出受控 SQL 子集')
    approved_functions = {'ABS', 'AND', 'CASE', 'CAST', 'COALESCE', 'COUNT', 'IF', 'LOWER',
                          'MAX', 'MIN', 'NULLIF', 'OR', 'SUBSTRING', 'SUM', 'TRIM',
                          'AVG', 'ROUND', 'FLOOR', 'CEIL', 'UPPER', 'LENGTH', 'CONCAT',
                          'REPLACE', 'LPAD', 'RPAD', 'DATE_TRUNC', 'DATE_PART', 'TO_CHAR',
                          'TO_DATE', 'NOW', 'AGE'}
    for function in tree.find_all(exp.Func):
        name = function.name if isinstance(function, exp.Anonymous) else function.sql_name()
        if name.upper() not in approved_functions:
            raise ContractError('FUNCTION_NOT_ALLOWED', '函数未在本地受控清单中批准：' + name)
    if set(re.findall(r':(gea_p\d+)\b', sql)) != set(parameters):
        raise ContractError('PARAMETER_MISMATCH', 'SQL 参数与配置不一致')
    for union in tree.find_all(exp.Union):
        if union.args.get('distinct') is not False:
            raise ContractError('QUERY_FEATURE_NOT_SUPPORTED', '只允许 UNION ALL')
    for star in tree.find_all(exp.Star):
        if not isinstance(star.parent, exp.Count):
            raise ContractError('DERIVED_STAR_NOT_SUPPORTED', '必须显式列出输出字段')
    for select in tree.find_all(exp.Select):
        aliases = [item.alias for item in select.expressions]
        if any(not isinstance(item, exp.Alias) for item in select.expressions) or len(set(aliases)) != len(aliases) or any(not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_$]*', alias) for alias in aliases):
            raise ContractError('OUTPUT_ALIAS_REQUIRED', '输出必须具有唯一显式别名')
    for join in tree.find_all(exp.Join):
        if join.side in ('RIGHT', 'FULL') or (join.kind != 'CROSS' and join.args.get('on') is None):
            raise ContractError('JOIN_TYPE_NOT_SUPPORTED', '使用显式 INNER/LEFT/CROSS JOIN')
    for placeholder in tree.find_all(exp.Placeholder):
        if isinstance(parameters.get(placeholder.name), list) and not isinstance(placeholder.parent, exp.In):
            raise ContractError('PARAMETER_TYPE_MISMATCH', '集合参数只能用于 IN')
    for scope in traverse_scope(tree):
        if scope.is_correlated_subquery:
            raise ContractError('QUERY_FEATURE_NOT_SUPPORTED', '不支持关联子查询')
        for _, (_, source) in scope.selected_sources.items():
            if isinstance(source, exp.Table) and (source.db or source.catalog or source.name not in schema):
                raise ContractError('SOURCE_NOT_AVAILABLE', '当前数据库缺少配置来源：' + source.name)
        for col in scope.columns:
            if not col.table:
                if col.name not in scope.expression.named_selects:
                    raise ContractError('FIELD_SOURCE_AMBIGUOUS', '多源字段需要来源别名：' + col.name)
                continue
            source = scope.sources.get(col.table)
            if isinstance(source, exp.Table):
                if col.name not in schema[source.name]:
                    raise ContractError('FIELD_NOT_AVAILABLE', '当前数据库缺少配置字段：' + col.name)
            elif source is None or col.name not in source.expression.named_selects:
                raise ContractError('FIELD_NOT_AVAILABLE', '派生字段不可用：' + col.name)
    return tree


def bind(sql, parameters):
    bound = {}
    # PyMySQL performs binding; double percent signs before introducing its placeholders.
    sql = sql.replace('%', '%%')
    tokens = r"'(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"|--[^\r\n]*|/\*[\s\S]*?\*/|:(gea_p\d+)\b"
    def replace(match):
        name = match[1]
        if not name:
            return match[0]
        value = parameters[name]
        if isinstance(value, list):
            for index, item in enumerate(value):
                bound[name + '_' + str(index)] = item
            return ', '.join('%(' + name + '_' + str(i) + ')s' for i in range(len(value)))
        bound[name] = value
        return '%(' + name + ')s'
    return re.sub(tokens, replace, sql), bound


def json_value(value):
    if isinstance(value, decimal.Decimal):
        return str(value)
    if isinstance(value, (dt.date, dt.datetime)):
        return value.isoformat()
    raise TypeError(type(value).__name__)


def direct_preview_document(html):
    # QLL's packaged page prohibits network IO. Only this loopback preview
    # needs same-origin POST; keep the installed document and other directives intact.
    return re.sub(r'<meta\b[^>]*http-equiv="Content-Security-Policy"[^>]*>',
                  lambda match: match[0].replace("connect-src 'none'", "connect-src 'self'"),
                  html, flags=re.I)


class Executor:
    def __init__(self, connection_file):
        self.connection_file = pathlib.Path(connection_file)
        self._catalog_lock = threading.Lock()
        self._catalog = None
        self._catalog_until = 0
        self._catalog_connection = None

    def connect(self):
        settings = json.loads(self.connection_file.read_text())
        return pymysql.connect(**settings, connect_timeout=8, read_timeout=60,
                               cursorclass=pymysql.cursors.DictCursor)

    def schema(self, conn):
        with conn.cursor() as cursor:
            cursor.execute('SHOW TABLES')
            tables = [next(iter(row.values())) for row in cursor.fetchall()]
            result = {}
            for table in tables:
                if not re.fullmatch(r'[a-z][a-z0-9_]*', table):
                    continue
                cursor.execute('SHOW COLUMNS FROM `' + table + '`')
                result[table] = {row['Field'] for row in cursor.fetchall()}
            return result

    def query_schema(self, conn):
        # Physical metadata only, for this explicit direct-preview account.
        # Business results, permissions and query validation are never cached.
        stamp = self.connection_file.stat() if self.connection_file.exists() else None
        identity = (stamp.st_mtime_ns, stamp.st_size) if stamp else None
        with self._catalog_lock:
            if self._catalog is None or identity != self._catalog_connection or time.monotonic() >= self._catalog_until:
                self._catalog = self.schema(conn)
                self._catalog_connection = identity
                self._catalog_until = time.monotonic() + 30
            return self._catalog

    def execute(self, agent, query_id, values, conn=None, schema=None):
        config = config_for(agent)
        if query_id not in config['queries']:
            raise ContractError('QUERY_NOT_REGISTERED', '当前 Agent 未登记该查询')
        query = config['queries'][query_id]
        parameters = validate_parameters(query, values, query_id)
        own = conn is None
        conn = conn or self.connect()
        try:
            tree = inspect(query['request']['sql'], parameters, schema if schema is not None else self.query_schema(conn))
            sql, bound = bind(query['request']['sql'], parameters)
            with conn.cursor() as cursor:
                cursor.execute(sql, bound)
                rows = cursor.fetchmany(100001)
                if len(rows) > 100000:
                    raise ContractError('RESULT_TOO_LARGE', '结果超过完整读取上限，请收窄范围')
                columns = [col[0] for col in cursor.description]
            if columns != tree.named_selects:
                raise ContractError('RESULT_COLUMNS_CHANGED', '返回列与配置不一致')
            return {'rows': rows, 'returnedColumns': columns, 'rejectedColumns': [],
                    'source': 'direct-doris', 'authorization': 'database-account-only',
                    'queryId': query_id, 'configVersion': hashlib.sha256(json.dumps(config, sort_keys=True).encode()).hexdigest()}
        finally:
            if own:
                conn.close()


def replay(executor, report_path):
    results, conn = [], executor.connect()
    try:
        schema = executor.schema(conn)
        checked = {}
        for agent in AGENTS:
            for query_id, query in config_for(agent)['queries'].items():
                values = {spec['name']: query['request']['parameters'][key]
                          for key, spec in query['parameterSpec'].items()}
                fingerprint = json.dumps([query['request']['sql'], values], sort_keys=True)
                row = {'agent': agent, 'queryId': query_id}
                try:
                    if fingerprint not in checked:
                        result = executor.execute(agent, query_id, values, conn, schema)
                        checked[fingerprint] = {'rows': len(result['rows']), 'columns': result['returnedColumns']}
                    row.update(status='passed', **checked[fingerprint])
                except Exception as error:
                    row.update(status='failed', code=getattr(error, 'code', 'SOURCE_QUERY_FAILED'), message=str(error))
                results.append(row)
    finally:
        conn.close()
    report = {'checkedAt': dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat(),
              'mode': 'direct-read-only', 'geaAuthorization': 'not-checked',
              'configSha256': {agent: hashlib.sha256((ROOT / 'business' / ('inventory-' + agent) / 'sql.config.json').read_bytes()).hexdigest() for agent in AGENTS},
              'passed': sum(row['status'] == 'passed' for row in results),
              'failed': sum(row['status'] == 'failed' for row in results),
              'uniqueQueries': len(checked), 'results': results}
    pathlib.Path(report_path).write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({key: value for key, value in report.items() if key != 'results'}, ensure_ascii=False))
    for row in results:
        if row['status'] == 'failed':
            print(row['agent'], row['queryId'], row['code'], row['message'][:250])
    return report['failed'] == 0


def serve(executor, port):
    token = secrets.token_urlsafe(32)
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def respond(self, status, data):
            body = json.dumps(data, ensure_ascii=False, default=json_value).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            match = re.fullmatch(r'/agents/([a-z]+)', self.path)
            if not match or match[1] not in AGENTS:
                self.respond(404, {'pages': ['/agents/' + agent for agent in AGENTS]})
                return
            agent = match[1]
            path = ROOT / 'lib' / 'business' / ('inventory-' + agent) / 'index.html'
            if not path.is_file():
                self.respond(503, {'code': 'PAGE_NOT_BUILT', 'message': '先构建该 Agent 页面'})
                return
            config = config_for(agent)
            escape = lambda value: json.dumps(value, ensure_ascii=False).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
            settings = {'path': '/api/agents/' + agent + '/query', 'token': token}
            bridge = """<script>
window.addEventListener('message', function(event) {
 if(event.source!==window || event.data?.protocol!=='gea-html-v2' || event.data.type!=='ready')return;
 const pair=new MessageChannel();pair.port1.onmessage=function(event){const m=event.data;if(m.type!=='request')return;
 const localAccess={mode:'direct-doris',trusted:false,authorization:'database-account-only'};
 const ok=m.method==='context'||m.method==='access';pair.port1.postMessage({type:'response',id:m.id,session:m.session,
 ...(ok?{result:m.method==='access'?localAccess:{local:true}}:{error:'本地只读直连仅提供配置查询；此能力需要后续宿主接入'})});};
 window.postMessage({protocol:'gea-html-v2',type:'connect',context:{session:'local-direct-preview',plugin:AGENT}},location.origin,[pair.port2]);
});
document.addEventListener('DOMContentLoaded',function(){const note=document.createElement('div');note.setAttribute('role','status');note.style.cssText='padding:8px;background:#fff7e8;color:#874d00';note.textContent='本地只读直连 · 未验证 GEA 用户权限 · 未执行业务写入';document.body.prepend(note);});
</script>""".replace('AGENT', escape(config['agentId']))
            injection = '<script type="application/json" id="agent-sql-config">' + escape(config) + '</script>'
            injection += '<script type="application/json" id="agent-sql-direct">' + escape(settings) + '</script>' + bridge
            html = direct_preview_document(path.read_text())
            head = re.search(r'<head\b[^>]*>', html, re.I)
            pos = head.end() if head else re.search(r'<script\b', html, re.I).start()
            html = html[:pos] + injection + html[pos:]
            body = html.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            try:
                origin = 'http://127.0.0.1:' + str(self.server.server_port)
                if self.headers.get('Origin') not in (None, origin) or self.headers.get('X-SQL-Preview') != token:
                    raise ContractError('LOCAL_ACCESS_DENIED', '本地查询凭据无效')
                match = re.fullmatch(r'/api/agents/([a-z]+)/query', self.path)
                length = int(self.headers.get('Content-Length', '0'))
                if not match or not 0 < length <= 65536 or self.headers.get('Content-Type') != 'application/json':
                    raise ContractError('INVALID_QUERY_REQUEST', '查询请求无效')
                payload = json.loads(self.rfile.read(length))
                if set(payload) != {'queryId', 'parameters'} or not isinstance(payload['queryId'], str):
                    raise ContractError('INVALID_QUERY_REQUEST', '只能提交 queryId 和业务参数')
                self.respond(200, executor.execute(match[1], payload['queryId'], payload['parameters']))
            except (ContractError, ValueError, TypeError) as error:
                self.respond(400, {'code': getattr(error, 'code', 'INVALID_QUERY_REQUEST'), 'message': str(error)})
            except Exception:
                self.respond(503, {'code': 'SOURCE_QUERY_FAILED', 'message': '数据源查询失败，请检查本地连接和配置'})

    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    settings = ROOT / '.runtime' / 'sql-preview.json'
    settings.parent.mkdir(exist_ok=True)
    settings.write_text(json.dumps({'url': 'http://127.0.0.1:' + str(server.server_port), 'token': token}))
    settings.chmod(0o600)
    print('Local SQL executor: http://127.0.0.1:' + str(server.server_port), flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()
        settings.unlink(missing_ok=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--connection', required=True, help='本地 JSON 连接文件；不得放入源码')
    parser.add_argument('--replay', metavar='REPORT', help='只读回放每个 Agent 配置中的查询')
    parser.add_argument('--port', type=int, default=8876)
    args = parser.parse_args()
    executor = Executor(args.connection)
    if args.replay:
        raise SystemExit(0 if replay(executor, args.replay) else 1)
    serve(executor, args.port)
