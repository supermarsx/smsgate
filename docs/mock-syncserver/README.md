# Mock syncserver stubs

Wiremock-compatible folder for local development with `docker-compose up`.

- Place mappings in `mappings/` and response bodies in `__files/` to simulate `/api/v1/*` endpoints.
- Example mappings can be added later; by default Wiremock will return 404s, which keeps the smsgate2 UI online while you build the real syncserver.
