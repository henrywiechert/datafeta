ROOT_DIR := $(patsubst %/,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))
BACKEND_DIR := $(ROOT_DIR)/backend
FRONTEND_DIR := $(ROOT_DIR)/frontend

.PHONY: test lint

lint:
	cd "$(FRONTEND_DIR)" && npm run lint

test:
	@backend_status=0; frontend_status=0; \
	if [ -f "$(BACKEND_DIR)/.venv/bin/activate" ]; then \
		. "$(BACKEND_DIR)/.venv/bin/activate"; \
	elif [ -f "$(ROOT_DIR)/.venv/bin/activate" ]; then \
		. "$(ROOT_DIR)/.venv/bin/activate"; \
	else \
		echo "ERROR: No project virtualenv found (expected backend/.venv). Create one with Python 3.11+ before running tests." >&2; \
		exit 1; \
	fi; \
	cd "$(BACKEND_DIR)" && pytest tests/ -v --tb=short || backend_status=$$?; \
	cd "$(FRONTEND_DIR)" && CI=true npm test -- --watchAll=false || frontend_status=$$?; \
	test $$backend_status -eq 0 -a $$frontend_status -eq 0
