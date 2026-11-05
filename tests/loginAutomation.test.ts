// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

describe("automatic login", () => {
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ""; });

  it("immediately syncs autofilled Angular fields and clicks login", async () => {
    vi.useFakeTimers();
    vi.resetModules();
    document.body.innerHTML = `<form><input formcontrolname="username" value="zekeriyakoy"><input type="password" value="secret"><button type="submit">Giriş</button></form>`;
    const username = document.querySelector<HTMLInputElement>('[formcontrolname="username"]')!;
    const inputListener = vi.fn();
    const clickListener = vi.fn((event: Event) => event.preventDefault());
    username.addEventListener("input", inputListener);
    document.querySelector("button")!.addEventListener("click", clickListener);
    const { tryAutomaticLogin } = await import("../src/content/loginAutomation");
    const resultPromise = tryAutomaticLogin();
    await vi.runAllTimersAsync();
    await expect(resultPromise).resolves.toBe("clicked");
    expect(inputListener).toHaveBeenCalled();
    expect(clickListener).toHaveBeenCalledOnce();
  });

  it("handles the new V-NEXT login card structure (with language dropdown and custom labels)", async () => {
    vi.useFakeTimers();
    vi.resetModules();
    document.body.innerHTML = `
      <div class="login-card">
        <div class="logo">DyDo DRINCO TURKEY</div>
        <div class="mat-form-field">
          <label class="floating-label">Kullanıcı Adı*</label>
          <input class="mat-input" value="zekeriyakoy">
        </div>
        <div class="mat-form-field">
          <label class="floating-label">Şifre*</label>
          <input type="password" class="mat-input" value="123456">
        </div>
        <div class="mat-form-field">
          <label class="floating-label">Lütfen Dil Seçiniz</label>
          <div role="combobox">Türkçe</div>
        </div>
        <button type="button" class="btn btn-primary login-button">Giriş</button>
        <a href="#">Şifremi Unuttum</a>
        <footer>V 1.0.16.0</footer>
      </div>
    `;

    const clickListener = vi.fn((event: Event) => event.preventDefault());
    document.querySelector("button")!.addEventListener("click", clickListener);

    const { detectPage } = await import("../src/content/prmDetector");
    expect(detectPage()).toBe("login");

    const { tryAutomaticLogin } = await import("../src/content/loginAutomation");
    const resultPromise = tryAutomaticLogin();
    await vi.runAllTimersAsync();
    await expect(resultPromise).resolves.toBe("clicked");
    expect(clickListener).toHaveBeenCalledOnce();
  });
});
