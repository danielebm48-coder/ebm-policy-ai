import React from 'react';
import Layout from '../components/Layout';

const AdminPanel: React.FC = () => {
  // Datos simulados para el dashboard
  const stats = [
    { label: 'Consultas IA (Hoy)', value: '142', trend: '+12%', color: 'var(--primary-blue)' },
    { label: 'Políticas Activas', value: '28', trend: 'Estable', color: 'var(--accent-gold)' },
    { label: 'Usuarios Activos', value: '1,205', trend: '+5%', color: 'var(--action-green)' },
    { label: 'Temas Críticos', value: '3', trend: 'Atención', color: '#ef4444' }
  ];

  const recentPolicies = [
    { id: 1, title: 'Reglamento de Convivencia 2026', version: '2.1', status: 'Publicado', lastUpdate: '20/05/2026' },
    { id: 2, title: 'Protocolo de Seguridad Digital', version: '1.0', status: 'En Revisión', lastUpdate: '24/05/2026' },
    { id: 3, title: 'Normativa de Evaluación Distancia', version: '1.5', status: 'Publicado', lastUpdate: '15/05/2026' },
  ];

  return (
    <Layout role="directivo" title="Portal de Gobernanza y Decisiones">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
        {stats.map((stat, i) => (
          <div key={i} style={{ 
            padding: '1.5rem', 
            backgroundColor: 'var(--white)', 
            borderRadius: 'var(--radius-md)', 
            boxShadow: 'var(--shadow-sm)',
            border: '1px solid var(--nickel-medium)',
            borderTop: `4px solid ${stat.color}`
          }}>
            <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.5rem', fontWeight: 600 }}>{stat.label}</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem' }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-dark)' }}>{stat.value}</div>
              <div style={{ fontSize: '0.8125rem', color: stat.trend.includes('+') ? '#10b981' : '#64748b', marginBottom: '0.5rem' }}>
                {stat.trend}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Gestión de Políticas</h2>
            <button style={{ 
              backgroundColor: 'var(--action-green)', 
              color: 'var(--white)', 
              border: 'none', 
              padding: '0.5rem 1rem', 
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              fontSize: '0.875rem'
            }}>
              + Cargar Documento
            </button>
          </div>
          
          <div style={{ 
            backgroundColor: 'var(--white)', 
            borderRadius: 'var(--radius-md)', 
            border: '1px solid var(--nickel-medium)',
            overflow: 'hidden'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead style={{ backgroundColor: 'var(--nickel-light)', fontSize: '0.875rem' }}>
                <tr>
                  <th style={{ padding: '1rem' }}>Título</th>
                  <th style={{ padding: '1rem' }}>Versión</th>
                  <th style={{ padding: '1rem' }}>Estado</th>
                  <th style={{ padding: '1rem' }}>Última Mod.</th>
                  <th style={{ padding: '1rem' }}>Acciones</th>
                </tr>
              </thead>
              <tbody style={{ fontSize: '0.9375rem' }}>
                {recentPolicies.map((policy) => (
                  <tr key={policy.id} style={{ borderBottom: '1px solid var(--nickel-light)' }}>
                    <td style={{ padding: '1rem', fontWeight: 500 }}>{policy.title}</td>
                    <td style={{ padding: '1rem' }}>{policy.version}</td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{ 
                        padding: '0.25rem 0.6rem', 
                        borderRadius: '12px', 
                        fontSize: '0.75rem', 
                        backgroundColor: policy.status === 'Publicado' ? '#ecfdf5' : '#fff7ed',
                        color: policy.status === 'Publicado' ? '#059669' : '#d97706',
                        border: policy.status === 'Publicado' ? '1px solid #d1fae5' : '1px solid #ffedd5'
                      }}>
                        {policy.status}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', color: '#64748b' }}>{policy.lastUpdate}</td>
                    <td style={{ padding: '1rem' }}>
                      <button style={{ background: 'none', border: 'none', color: 'var(--primary-blue)', cursor: 'pointer', fontSize: '0.875rem' }}>Editar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Consultas Frecuentes</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[
              { topic: 'Inasistencias y justificativos', count: 45 },
              { topic: 'Uso de dispositivos móviles', count: 32 },
              { topic: 'Protocolo de acoso escolar', count: 28 },
              { topic: 'Criterios de evaluación 2026', count: 19 }
            ].map((topic, i) => (
              <div key={i} style={{ 
                padding: '1rem', 
                backgroundColor: 'var(--white)', 
                borderRadius: 'var(--radius-md)', 
                border: '1px solid var(--nickel-medium)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontSize: '0.875rem' }}>{topic.topic}</span>
                <span style={{ 
                  fontWeight: 'bold', 
                  color: 'var(--primary-blue)',
                  backgroundColor: 'var(--nickel-light)',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  fontSize: '0.75rem'
                }}>
                  {topic.count}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default AdminPanel;
