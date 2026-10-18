import '@arco-design/web-react/dist/css/arco.css';
import React from 'react';
import { type WorkbenchHost } from './original/index.ts';
import type { CopyKey } from '../client/locales.ts';
import './workbench.css';
import './api-log.css';
type Translate = (key: CopyKey) => string;
export declare const workbenchHost: WorkbenchHost;
/** 只挂载真实 GEA 数据；未认证或查询失败时绝不切换到 fixture。 */
export declare function WorkbenchPage({ t }: {
    t: Translate;
}): React.JSX.Element;
export {};
