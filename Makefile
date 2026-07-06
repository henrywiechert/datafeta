ROOT_DIR := $(patsubst %/,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))
BACKEND_DIR := $(ROOT_DIR)/backend
FRONTEND_DIR := $(ROOT_DIR)/frontend
VENV_ACTIVATE := $(ROOT_DIR)/.venv/bin/activate

.PHONY: test lint

lint:
	cd "$(FRONTEND_DIR)" && npm run lint

test:
	@backend_status=0; frontend_status=0; \
	if [ -f "$(VENV_ACTIVATE)" ]; then \
		. "$(VENV_ACTIVATE)"; \
	fi; \
	cd "$(BACKEND_DIR)" && pytest tests/ -v --tb=short || backend_status=$$?; \
	cd "$(FRONTEND_DIR)" && CI=true npm test -- --watchAll=false || frontend_status=$$?; \
	test $$backend_status -eq 0 -a $$frontend_status -eq 0
