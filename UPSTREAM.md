# Source provenance

The former layout adapter originated from `deepseek-ai/deepseek-harness`, `packages/client/ui-layout/src/client`, local commit `7ef3457e9d` on `codex/dsh-chat-surface`. That copied shell, layout service, stores, column geometry and document-title implementation have exited this plugin's source and generated output.

The current adapter targets unmodified official commit `4878cdabd87d4041bdaff61d04c966883b9fd07a`. Official DSH owns AppFrame, sidebar, Conversation, workspace navigation and theme presentation. Workbench uses their public extension slots and provides its own page directory and package HTML presentation. The MIT license is retained in LICENSE. Business resource provenance remains in each resource directory.
