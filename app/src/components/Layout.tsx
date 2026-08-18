import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

interface LayoutProps {
  children: React.ReactNode;
  role?: string;
  title?: string;
}

const Layout: React.FC<LayoutProps> = ({ children, role, title }) => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('schoolPolicyAuth');
    navigate('/login');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <nav style={{
        background: 'var(--metallic-green-dark)',
        color: 'var(--white)',
        padding: '0.75rem 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: 'var(--shadow-md)',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <Link to="/" style={{ color: 'var(--white)', textDecoration: 'none', fontWeight: 'bold', fontSize: '1.25rem' }}>
            Maquilishuat
          </Link>
          {role && (
            <span style={{ 
              backgroundColor: 'rgba(255,255,255,0.1)', 
              padding: '0.25rem 0.75rem', 
              borderRadius: '20px', 
              fontSize: '0.875rem',
              textTransform: 'capitalize',
              border: '1px solid rgba(255,255,255,0.2)'
            }}>
              {role}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <button 
            onClick={handleLogout}
            style={{ 
              background: 'transparent', 
              color: 'var(--white)', 
              border: '1px solid rgba(255,255,255,0.4)',
              padding: '0.4rem 1rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.875rem'
            }}
          >
            Cerrar Sesión
          </button>
        </div>
      </nav>
      
      <main className="container" style={{ flex: 1, padding: '2rem 0' }}>
        {title && <h1 style={{ marginBottom: '2rem', borderBottom: '2px solid var(--nickel-light)', paddingBottom: '0.5rem' }}>{title}</h1>}
        {children}
      </main>

      <footer style={{ 
        padding: '1.5rem', 
        textAlign: 'center', 
        backgroundColor: 'var(--nickel-light)', 
        color: 'var(--text-dark)',
        fontSize: '0.875rem',
        marginTop: 'auto'
      }}>
        © 2026 School Policy AI - Sistema de Gestión Normativa Inteligente
      </footer>
    </div>
  );
};

export default Layout;
