import React, { useState } from "react";
import { loginCloud } from "../cloud/cloudSync";

interface LoginPageProps {
  onSuccess: () => Promise<void>;
}

export function LoginPage({ onSuccess }: LoginPageProps) {
  const [email, setEmail] = useState("emirhnnozcn@gmail.com");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setErrorMessage("Lütfen e-posta ve şifrenizi giriniz.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const result = await loginCloud(email, password);
    setIsLoading(false);

    if (result.success) {
      await onSuccess();
    } else {
      setErrorMessage(result.error || "Giriş başarısız. Lütfen bilgilerinizi kontrol edin.");
    }
  };

  return (
    <div className="login-card">
      <div className="login-header">
        <div className="login-brandmark">
          <span>D</span>
        </div>
        <h2>DyDo PRM Asistanı</h2>
        <p>Bulut ve Mobil Senkronizasyon Girişi</p>
      </div>

      {errorMessage && (
        <div className="login-alert-error">
          <span className="alert-icon">⚠️</span>
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="login-form">
        <div className="login-form-group">
          <label htmlFor="prm-email">E-posta Adresi</label>
          <div className="login-input-wrapper">
            <span className="input-icon">✉️</span>
            <input
              id="prm-email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="emirhnnozcn@gmail.com"
              disabled={isLoading}
            />
          </div>
        </div>

        <div className="login-form-group">
          <label htmlFor="prm-password">Şifre</label>
          <div className="login-input-wrapper">
            <span className="input-icon">🔒</span>
            <input
              id="prm-password"
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={isLoading}
            />
            <button
              type="button"
              className="btn-toggle-pwd"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
            >
              {showPassword ? "🙈" : "👁️"}
            </button>
          </div>
        </div>

        <div className="login-help-row">
          <small className="login-info-text">
            📱 Mobil uygulamada kullandığınız kimlik bilgileriyle giriş yapabilirsiniz.
          </small>
        </div>

        <button type="submit" className="btn-login" disabled={isLoading}>
          {isLoading ? (
            <span className="btn-loading-content">
              <span className="login-spinner"></span>
              Giriş Yapılıyor...
            </span>
          ) : (
            "Giriş Yap"
          )}
        </button>
      </form>

      <div className="login-footer">
        <span>DyDo PRM Assistant • v1.4.0</span>
      </div>
    </div>
  );
}

