import {
  buildCliAuthVerifyUrl,
  buildProjectApiUrl,
  createProjectApiKey,
  detectProjectIdFromUrl,
  listProjectEnvironments,
  resolveSession,
  verifyCliAuthentication,
} from "../../src/cli/utils/http";

describe("CLI auth helpers", () => {
  it("detects the project id from a project URL", () => {
    expect(
      detectProjectIdFromUrl("https://edge.atmyapp.com/projects/project-123")
    ).toBe("project-123");
  });

  it("returns undefined when the URL does not include a project id", () => {
    expect(detectProjectIdFromUrl("https://edge.atmyapp.com")).toBeUndefined();
  });

  it("can resolve a session from direct overrides without a saved config", () => {
    expect(
      resolveSession({
        token: "cli-ama-valid",
        url: "https://edge.atmyapp.com/projects/project-123",
        projectId: "project-123",
      }),
    ).toEqual({
      token: "cli-ama-valid",
      url: "https://edge.atmyapp.com/projects/project-123",
      projectId: "project-123",
    });
  });

  it("builds the verify endpoint from a root URL", () => {
    expect(buildCliAuthVerifyUrl("https://edge.atmyapp.com")).toBe(
      "https://edge.atmyapp.com/v0/cli-keys/auth/verify"
    );
  });

  it("builds the verify endpoint from a project URL", () => {
    expect(
      buildCliAuthVerifyUrl(
        "https://edge.atmyapp.com/projects/project-123?foo=bar"
      )
    ).toBe("https://edge.atmyapp.com/v0/cli-keys/auth/verify");
  });

  it("does not duplicate /v0 when the project URL already includes it", () => {
    expect(
      buildCliAuthVerifyUrl(
        "http://localhost:8585/v0/projects/project-123"
      )
    ).toBe("http://localhost:8585/v0/cli-keys/auth/verify");
  });

  it("builds project API urls from a project url", () => {
    expect(
      buildProjectApiUrl(
        "https://edge.atmyapp.com/projects/project-123",
        "project-123",
        "api-keys/create",
      ),
    ).toBe("https://edge.atmyapp.com/v0/projects/project-123/api-keys/create");
  });

  it("builds project API urls from a v0 project url without duplicating v0", () => {
    expect(
      buildProjectApiUrl(
        "http://localhost:8585/v0/projects/project-123",
        "project-123",
        "environments",
      ),
    ).toBe("http://localhost:8585/v0/projects/project-123/environments");
  });

  it("returns the verified project info on success", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          valid: true,
          projectId: "project-123",
          keyName: "Main CLI key",
        },
        error: "",
      }),
      text: async () => "",
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      verifyCliAuthentication({
        url: "https://edge.atmyapp.com/projects/project-123",
        token: "cli-ama-valid",
      })
    ).resolves.toEqual({
      projectId: "project-123",
      keyName: "Main CLI key",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://edge.atmyapp.com/v0/cli-keys/auth/verify",
      {
        method: "GET",
        headers: {
          Authorization: "Bearer cli-ama-valid",
        },
      }
    );
  });

  it("throws a helpful error when the server rejects the key", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        success: false,
        data: null,
        error: "Invalid CLI key",
      }),
      text: async () => "Invalid CLI key",
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      verifyCliAuthentication({
        url: "https://edge.atmyapp.com",
        token: "cli-ama-invalid",
      })
    ).rejects.toThrow("Invalid CLI key");
  });

  it("lists project environments", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: [{ id: 1, name: "production", projectId: "project-123" }],
        error: "",
      }),
      text: async () => "",
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      listProjectEnvironments({
        url: "https://edge.atmyapp.com/projects/project-123",
        token: "cli-ama-valid",
        projectId: "project-123",
      }),
    ).resolves.toEqual([
      { id: 1, name: "production", projectId: "project-123" },
    ]);
  });

  it("creates a project api key", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          id: "pk-ama-new",
          name: "Template Key",
          projectId: "project-123",
          environment_id: 1,
        },
        error: "",
      }),
      text: async () => "",
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      createProjectApiKey({
        url: "https://edge.atmyapp.com/projects/project-123",
        token: "cli-ama-valid",
        projectId: "project-123",
        name: "Template Key",
        environmentId: 1,
      }),
    ).resolves.toEqual({
      id: "pk-ama-new",
      name: "Template Key",
      projectId: "project-123",
      environment_id: 1,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://edge.atmyapp.com/v0/projects/project-123/api-keys/create",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer cli-ama-valid",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Template Key",
          environment_id: 1,
        }),
      },
    );
  });
});
