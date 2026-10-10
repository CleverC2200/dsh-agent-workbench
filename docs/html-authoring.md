# HTML 作者源与构建

样板作者源为 `samples/html-table.html`，区域原型为 `static/regional/source/index.html`。Category/MPS 的当前应用作者源是 `static/<page>/source/{data.js,app.js}`；`SOURCE.json` 记录原提交、应用边界和固定 vendor/data digest；样式按Arco最后规则边界一次拆为固定`vendor.css`及可编辑`layout.css`，固定资源摘要和拆分来源记录在 SOURCE.json。构建先校验固定资源，再编译作者模块生成 `static/<page>/index.html` 与 `lib/static`；运行时只消费生成页面，不提取或解码旧 bundle。包产物不包含作者源目录。Category/MPS作者只承载业务正文；原模拟聊天、回复/流式生成路径已退出，正式Core承载唯一Conversation。MPS Studio、avatar/voice/persona保留为原型人物/语音预览设置，不改Core的模型或身份。

构建选择与依赖准备见[本地开发](local-development.md)。各资源来源和仍需验收的条件见[业务页面导航](business-pages.md)。
