import { adjustmentReasons, quantityAdjustmentKey } from './local-draft.js';

const columns = ['基地', 'SKU', '月份', '修正数量', '调整原因', '说明'];
export function createDemandAdjustmentUpload(react, { Upload, Dialog, parseCsv, downloadCsv }) {
  const h = react.createElement;
  return function DemandAdjustmentUpload({ draft, result, batch, apply, table }) {
    const [preview, setPreview] = react.useState(null);
    const [error, setError] = react.useState('');
    const [notice, setNotice] = react.useState('');
    const request = react.useRef(0);
    const current = react.useRef(draft.id);
    current.current = draft.id;
    react.useEffect(() => {
      setPreview(null);
      setError('');
      setNotice('');
      return () => {
        request.current++;
      };
    }, [draft.id]);
    const read = async (file) => {
      const version = draft.id;
      const token = ++request.current;
      setPreview(null);
      setError('');
      setNotice('');
      try {
        const records = parseCsv(await file.text(), columns);
        if (current.current !== version || request.current !== token) return;
        if (!records.length) throw Error('文件没有需求修正行。');
        const available = new Map();
        for (const row of [...result.rows, ...(result.referenceRows ?? [])]) {
          const key = JSON.stringify([row.base, row.code, row.month]);
          if (!available.has(key)) available.set(key, []);
          available.get(key).push(row);
        }
        const seen = new Set();
        const entries = records.map((record, index) => {
          const prefix = `第${index + 2}行`;
          const candidates =
            available.get(JSON.stringify([record['基地'], record.SKU, record['月份']])) ?? [];
          if (candidates.length !== 1)
            throw Error(`${prefix}基地SKU或月份不在当前版本有效范围，或明细不唯一。`);
          const row = candidates[0];
          const value = Number(record['修正数量']);
          if (
            !record['修正数量'] ||
            !Number.isFinite(value) ||
            value < 0 ||
            value > Number.MAX_SAFE_INTEGER
          )
            throw Error(`${prefix}修正数量须为安全范围内的非负有限数。`);
          if (!adjustmentReasons.includes(record['调整原因']))
            throw Error(`${prefix}请选择六种合法调整原因之一。`);
          if (record['调整原因'] === '其他' && !record['说明'])
            throw Error(`${prefix}其他原因必须填写说明。`);
          const reason =
            record['调整原因'] === '其他'
              ? `其他：${record['说明']}`
              : [record['调整原因'], record['说明']].filter(Boolean).join('：');
          if (reason.length > 1000) throw Error(`${prefix}调整原因及说明不得超过1000字。`);
          const meta = {
            kind: 'base-sku',
            month: row.month,
            base: row.base,
            code: row.code,
            category: row.category,
            group: row.group,
            systemValue: row.systemDemand,
          };
          const key = quantityAdjustmentKey(meta);
          if (seen.has(key)) throw Error(`${prefix}基地SKU月份重复。`);
          seen.add(key);
          return {
            meta,
            value,
            reason,
            previous: row.demand,
            label: `${row.base} ${row.code} ${row.month}`,
          };
        });
        setPreview({ version, entries, draft, result });
      } catch (failure) {
        if (current.current === version && request.current === token)
          setError(`${failure.message} 未应用任何修正。`);
      }
    };
    const confirm = () => {
      try {
        if (preview.version !== draft.id || preview.draft !== draft || preview.result !== result)
          throw Error('评估版本或输入已变化，请重新上传核对。');
        apply(preview.entries);
        setNotice(`已应用${preview.entries.length}条需求修正，原始输入和历史已保留。`);
        setPreview(null);
      } catch (failure) {
        setError(failure.message);
      }
    };
    return h(
      react.Fragment,
      null,
      h(
        'div',
        { className: 'wf-card-actions' },
        !batch.active && h(Upload, { label: '选择需求修正CSV', text: '上传需求修正', read }),
        h(
          'button',
          {
            className: 'mps-download',
            onClick: () => downloadCsv('需求修正-模板.csv', columns, []),
          },
          '下载需求修正模板',
        ),
        h(
          'span',
          { className: 'dc-card-note' },
          '按当前版本基地SKU月份修正，含第四月库存参考；校验预览后确认生效。',
        ),
      ),
      !preview && error && h('p', { role: 'alert' }, error),
      notice && h('p', { role: 'status' }, notice),
      preview &&
        h(
          Dialog,
          {
            title: '确认需求修正上传',
            close: () => {
              setPreview(null);
              setError('');
            },
            footer: h(
              react.Fragment,
              null,
              h(
                'button',
                {
                  autoFocus: true,
                  onClick: () => {
                    setPreview(null);
                    setError('');
                  },
                },
                '取消上传',
              ),
              h('button', { className: 'dc-primary', onClick: confirm }, '确认应用修正'),
            ),
          },
          h(
            'p',
            null,
            `${draft.name}，共${preview.entries.length}条，预览前50条，确认应用全部有效行。仅修改文件中的基地SKU月份明细；下市品人工正需求保留有效并报告异常。`,
          ),
          table(
            '需求修正预览',
            ['基地', 'SKU', '月份', '原有效需求', '修正数量', '调整原因及说明'],
            preview.entries
              .slice(0, 50)
              .map((entry) => [
                entry.meta.base,
                entry.meta.code,
                entry.meta.month,
                entry.previous ?? '待补',
                entry.value,
                entry.reason,
              ]),
          ),
          error && h('p', { role: 'alert' }, error),
        ),
    );
  };
}
