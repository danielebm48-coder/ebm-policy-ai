import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

declare const __API_BASE_URL__: string;

const RegisterPage: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('padre');
  const [studentCode, setStudentCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const navigate = useNavigate();
  const apiBaseUrl = (__API_BASE_URL__ || window.location.origin || '').replace(/\/$/, '');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name || !email || !password || !role) {
      setError('Por favor, completa todos los campos obligatorios.');
      return;
    }

    if (role === 'alumno' && !studentCode) {
      setError('El código de alumno es obligatorio.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role, studentCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'No se pudo completar el registro');
      }

      setSuccess(data.message || '¡Registro exitoso! Redirigiendo...');
      
      if (!data.pendingApproval) {
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Error al registrarse.');
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
      backgroundImage: 'linear-gradient(135deg, rgba(237, 245, 242, 0.96), rgba(220, 241, 233, 0.96))',
      padding: '2rem 0'
    }}>
      <div style={{ 
        maxWidth: 480, 
        width: '90%', 
        padding: '2.5rem', 
        backgroundColor: 'var(--white)', 
        borderRadius: 'var(--radius-lg)', 
        boxShadow: 'var(--shadow-md)',
        border: '1px solid var(--nickel-medium)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>Crear Cuenta</h1>
          <p style={{ color: '#64748b', fontSize: '0.9375rem' }}>Únete a la comunidad de Maquilishuat</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600 }}>
              Nombre Completo
            </label>
            <input 
              type="text"
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              placeholder="Tu nombre"
              style={{ width: '100%' }} 
            />
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600 }}>
              Correo electrónico
            </label>
            <input 
              type="email"
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              placeholder={['profesor', 'admin', 'directivo'].includes(role) ? "usuario@ebm.edu.sv" : "ejemplo@correo.com"}
              style={{ width: '100%' }} 
            />
            {['profesor', 'admin', 'directivo'].includes(role) && (
              <p style={{ fontSize: '0.75rem', color: 'var(--metallic-green-dark)', marginTop: '0.25rem' }}>
                * Requiere correo @ebm.edu.sv
              </p>
            )}
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600 }}>
              Rol en la organización
            </label>
            <select 
              value={role} 
              onChange={(e) => setRole(e.target.value)}
              style={{ 
                width: '100%', 
                padding: '0.75rem', 
                borderRadius: 'var(--radius-md)', 
                border: '1px solid var(--nickel-medium)',
                backgroundColor: 'var(--white)'
              }}
            >
              <option value="padre">Padre de Familia</option>
              <option value="alumno">Alumno</option>
              <option value="profesor">Profesor</option>
              <option value="admin">Administrador</option>
              <option value="directivo">Directivo / Rectoría</option>
            </select>
          </div>

          {role === 'alumno' && (
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600 }}>
                Código de Alumno Autorizado
              </label>
              <input 
                type="text"
                value={studentCode} 
                onChange={(e) => setStudentCode(e.target.value)} 
                placeholder="EBM-2026-XXX"
                style={{ width: '100%' }} 
              />
            </div>
          )}

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600 }}>
              Contraseña
            </label>
            <div style={{ position: 'relative' }}>
              <input 
                type={showPassword ? "text" : "password"} 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
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

          {success && (
            <div style={{ 
              backgroundColor: '#f0fdf4', 
              color: '#16a34a', 
              padding: '0.75rem', 
              borderRadius: 'var(--radius-md)', 
              fontSize: '0.8125rem',
              marginBottom: '1.5rem',
              border: '1px solid #dcfce7'
            }}>
              {success}
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
              opacity: isSubmitting ? 0.7 : 1
            }}
          >
            {isSubmitting ? 'Registrando...' : 'Registrarse'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.875rem' }}>
          ¿Ya tienes cuenta? <Link to="/login" style={{ color: 'var(--metallic-green-dark)', fontWeight: 600, textDecoration: 'none' }}>Inicia sesión</Link>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
