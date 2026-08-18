import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

declare const __API_BASE_URL__: string;

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const apiBaseUrl = (__API_BASE_URL__ || window.location.origin || '').replace(/\/$/, '');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email || !password) {
      setError('Por favor, completa todos los campos.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Credenciales invalidas');
      }

      localStorage.setItem('schoolPolicyAuth', JSON.stringify(data));

      if (data.user.role === 'admin' || data.user.role === 'directivo') {
        navigate('/admin');
      } else {
        navigate(`/dashboard/${data.user.role}`);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo iniciar sesion.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo">M</div>
          <h1 className="auth-title">Maquilishuat</h1>
          <p className="auth-subtitle">AI Policy Repository</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label className="form-label">Correo electrónico</label>
            <input 
              type="email"
              value={email} 
              onChange={(event) => setEmail(event.target.value)} 
              placeholder="ej: profesor@ebm.edu.sv"
              className="auth-input"
            />
          </div>

          <div className="form-field">
            <label className="form-label">Contraseña</label>
            <div className="password-wrap">
              <input 
                type={showPassword ? "text" : "password"} 
                value={password} 
                onChange={(event) => setPassword(event.target.value)} 
                placeholder="••••••••"
                className="auth-input"
                style={{ paddingRight: '40px' }}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="password-toggle">
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                )}
              </button>
            </div>
          </div>

          {error && (<div className="auth-error">{error}</div>)}

          <button type="submit" disabled={isSubmitting} className="btn-primary" style={{ opacity: isSubmitting ? 0.7 : 1 }}>
            {isSubmitting ? 'Iniciando...' : 'Iniciar Sesión'}
          </button>
        </form>

        <div className="auth-footer">¿No tienes cuenta? <Link to="/register" style={{ color: 'var(--metallic-green-dark)', fontWeight: 600, textDecoration: 'none' }}>Regístrate aquí</Link></div>

        <div style={{ marginTop: '2rem', textAlign: 'center', fontSize: '0.8125rem', color: '#94a3b8' }}>
          Acceso institucional con @ebm.edu.sv
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
