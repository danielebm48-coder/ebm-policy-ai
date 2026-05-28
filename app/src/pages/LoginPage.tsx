import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!email || !password) {
      setError('Por favor, completa todos los campos.');
      return;
    }
    const normalized = email.toLowerCase();
    if (normalized.includes('directivo')) {
      navigate('/admin');
    } else if (normalized.includes('profesor')) {
      navigate('/dashboard/profesor');
    } else if (normalized.includes('alumno')) {
      navigate('/dashboard/alumno');
    } else if (normalized.includes('padre')) {
      navigate('/dashboard/padre');
    } else {
      setError('Usuario no reconocido. Prueba con "directivo", "profesor", "alumno" o "padre" en el correo.');
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      backgroundColor: 'var(--nickel-light)',
      backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(26, 95, 122, 0.05) 0%, transparent 40%), radial-gradient(circle at 80% 80%, rgba(134, 200, 188, 0.05) 0%, transparent 40%)'
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
            backgroundColor: 'var(--primary-blue)', 
            borderRadius: '16px', 
            margin: '0 auto 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--white)',
            fontSize: '2rem',
            fontWeight: 'bold',
            boxShadow: '0 4px 12px rgba(26, 95, 122, 0.3)'
          }}>
            S
          </div>
          <h1 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>E.B. Maquilishuat</h1>
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
              placeholder="ej: profesor@escuela.com"
              style={{ width: '100%' }} 
            />
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-dark)' }}>
              Contraseña
            </label>
            <input 
              type="password" 
              value={password} 
              onChange={(event) => setPassword(event.target.value)} 
              placeholder="••••••••"
              style={{ width: '100%' }} 
            />
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
            style={{ 
              width: '100%', 
              padding: '0.875rem', 
              backgroundColor: 'var(--primary-blue)', 
              color: 'var(--white)', 
              border: 'none', 
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              fontSize: '1rem',
              boxShadow: '0 4px 6px rgba(26, 95, 122, 0.2)'
            }}
          >
            Iniciar Sesión
          </button>
        </form>
        
        <div style={{ marginTop: '2rem', textAlign: 'center', fontSize: '0.8125rem', color: '#94a3b8' }}>
          Para este prototipo, usa correos que contengan:<br/>
          <strong>directivo, profesor, alumno, padre</strong>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
