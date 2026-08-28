import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["{shared,server,client}/src/**/*.test.ts"],
    environment: "node",
    // Set here rather than inside a test file: the server reads its
    // configuration when its modules load, and ESM hoists imports above any
    // assignment a test file makes.
    env: {
      NODE_ENV: "test",
      DATABASE_PATH: ":memory:",
      SESSION_SECRET: "test-secret-test-secret-test-secret-test",
      ADMIN_EMAIL: "admin@milieu.test",
      ADMIN_PASSWORD: "adminpassword123",
      REGISTRATION_ACCESS_CODE: "TEST-CODE",
    },
  },
});
