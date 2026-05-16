.PHONY: test

test:
	@backend_status=0; frontend_status=0; \
	if [ -f /Users/henry/projects/datafeta/.venv/bin/activate ]; then \
		. /Users/henry/projects/datafeta/.venv/bin/activate; \
	fi; \
	cd /Users/henry/projects/datafeta/backend && pytest tests/ -v --tb=short || backend_status=$$?; \
	cd /Users/henry/projects/datafeta/frontend && CI=true npm test -- --watchAll=false || frontend_status=$$?; \
	test $$backend_status -eq 0 -a $$frontend_status -eq 0