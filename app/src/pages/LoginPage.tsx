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
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      backgroundColor: 'var(--nickel-light)',
      backgroundImage: 'linear-gradient(135deg, rgba(237, 245, 242, 0.96), rgba(220, 241, 233, 0.96)), radial-gradient(circle at 20% 20%, rgba(127, 207, 178, 0.18) 0%, transparent 38%), radial-gradient(circle at 80% 80%, rgba(79, 169, 135, 0.14) 0%, transparent 42%)'
    }}>
      <div style={{ 
        maxWidth: 420, 
        width: '90%', 
        padding: '3rem 2.5rem', 
        backgroundColor: 'var(--white)', 
        borderRadius: 'var(--radius-lg)', 
        boxShadow: 'var(--shadow-md)',
        border: '1px solid var(--nickel-medium)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ 
            width: '64px', 
            height: '64px', 
            background: 'var(--metallic-green-dark)', 
            borderRadius: '16px', 
            margin: '0 auto 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--white)',
            fontSize: '2rem',
            fontWeight: 'bold',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45), 0 6px 18px rgba(79, 169, 135, 0.32)'
          }}>
            M
          </div>
          <h1 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>Maquilishuat</h1>
          <p style={{ color: '#64748b', fontSize: '0.9375rem' }}>AI Policy Repository</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-dark)' }}>
              Correo electrónico
            </label>
            <input 
              type="email"
              value={email} 
              onChange={(event) => setEmail(event.target.value)} 
              placeholder="ej: profesor@ebm.edu.sv"
              style={{ width: '100%' }} 
            />
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-dark)' }}>
              Contraseña
            </label>
            <div style={{ position: 'relative' }}>
              <input 
                type={showPassword ? "text" : "password"} 
                value={password} 
                onChange={(event) => setPassword(event.target.value)} 
                placeholder="••••••••"
                style={{ width: '100%', paddingRight: '40px' }} 
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '5px',
                  display: 'flex',
                  alignItems: 'center',
                  color: '#94a3b8'
                }}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                )}
              </button>
            </div>
          </div>
          
          {error && (
            <div style={{ 
              backgroundColor: '#fef2f2', 
              color: '#dc2626', 
              padding: '0.75rem', 
              borderRadius: 'var(--radius-md)', 
              fontSize: '0.8125rem',
              marginBottom: '1.5rem',
              border: '1px solid #fee2e2'
            }}>
              {error}
            </div>
          )}

          <button 
            type="submit" 
            disabled={isSubmitting}
            style={{ 
              width: '100%', 
              padding: '0.875rem', 
              background: 'var(--metallic-green-dark)', 
              color: 'var(--white)', 
              border: 'none', 
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              fontSize: '1rem',
              boxShadow: '0 4px 10px rgba(79, 169, 135, 0.24)',
              opacity: isSubmitting ? 0.7 : 1
            }}
          >
            {isSubmitting ? 'Iniciando...' : 'Iniciar Sesión'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.875rem' }}>
          ¿No tienes cuenta? <Link to="/register" style={{ color: 'var(--metallic-green-dark)', fontWeight: 600, textDecoration: 'none' }}>Regístrate aquí</Link>
        </div>
        
        <div style={{ marginTop: '2rem', textAlign: 'center', fontSize: '0.8125rem', color: '#94a3b8' }}>
          Acceso institucional con @ebm.edu.sv
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
