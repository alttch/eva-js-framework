VERSION=""

if event.type == CS_EVENT_PKG_INSTALL:
    logger.warning(f'Installing EVA JS Framework v{VERSION}')
    extract_package()
