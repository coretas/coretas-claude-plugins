# analysis_core

The framework-free package the audit report engine's service and plugin channels both compute
through. No FastAPI, no SQLAlchemy, no database session, no network call, no file-system access
beyond what is handed in, no `app.dependencies` import — importable and runnable from a plain
script with no application context.

Licensed separately from the rest of this repository (see `LICENSE`, MIT) because this package
is the single source of truth for a copy vendored into the public `coretas-claude-plugins` repo
(CRM-1929): the plugin channel runs entirely on the user's machine with no network call, so it
carries the analysis logic as source rather than calling back to this service.
