import {
  buildCliAuthVerifyUrl,
  detectProjectIdFromUrl,
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
});
