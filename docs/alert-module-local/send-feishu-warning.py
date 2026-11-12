"""Personal warning sender, reusing the configured Feishu App API client."""
import json,os,sys,winreg
sys.path.insert(0,os.environ.get('GEA_FEISHU_API_SCRIPTS',os.path.join(os.path.expanduser('~'),'.codex','skills','feishu-app-api','scripts')))
import feishu_api as api
def main():
    body=json.load(sys.stdin)
    kind=body.get('receiveIdType')
    receiver=body.get('receiveId','')
    if kind not in ('open_id','user_id','email') or not receiver or receiver.startswith('cli_'):
        return {'ok':False,'unknown':False,'error':'个人接收账号无效，App ID 不能作为接收人'}
    profile=body.get('credentialProfile','default')
    if profile not in ('default','warning-app'):
        return {'ok':False,'unknown':False,'error':'Unknown credential profile'}
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER,'Environment') as key:
        for name in ('FEISHU_APP_ID','FEISHU_APP_SECRET'):
            source='GEA_WARNING_'+name if profile=='warning-app' else name
            try: value=winreg.QueryValueEx(key,source)[0]
            except FileNotFoundError: value=os.environ.get(source,'')
            if not value:
                return {'ok':False,'unknown':False,'error':'Configure test app credentials locally first'}
            os.environ[name]=value
    try: token=api.get_tenant_token()
    except Exception: return {'ok':False,'unknown':False,'error':'飞书应用认证失败，请检查本机凭据配置'}
    try:
        status,raw,_=api._json_request(api.safe_api_url('/open-apis/im/v1/messages?receive_id_type='+kind),'POST',{'receive_id':receiver,'msg_type':'interactive','content':json.dumps(body['card'],ensure_ascii=False),'uuid':body['uuid']},token)
        result=json.loads(raw)
        if status<400 and result.get('code')==0:
            return {'ok':True,'messageId':result.get('data',{}).get('message_id')}
        return {'ok':False,'unknown':status>=500,'code':result.get('code'),'error':str(result.get('msg','发送失败'))[:300]}
    except Exception: return {'ok':False,'unknown':True,'error':'发送请求结果不确定，请核实回执后再重试'}
if __name__=='__main__':
    try: print(json.dumps(main(),ensure_ascii=False))
    except Exception: print(json.dumps({'ok':False,'unknown':False,'error':'本地发送配置或输入无效'},ensure_ascii=False))
