import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';

declare const __API_BASE_URL__: string;

type DocumentType = 'policy' | 'manual' | 'procedure' | 'handbook' | 'other';

interface PolicyDocument {
  id: string;
  name: string;
  type: DocumentType;
  category: string;
  description?: string;
  status: string;
  version: number;
  last_updated?: string;
  upload_date?: string;
}

const typeLabels: Record<DocumentType, string> = {
  policy: 'Politica',
  manual: 'Manual',
  procedure: 'Procedimiento',
  handbook: 'Guia',
  other: 'Otro',
};

const AdminPanel: React.FC = () => {
  const navigate = useNavigate();
  const storedAuth = localStorage.getItem('schoolPolicyAuth');
  const auth = storedAuth ? JSON.parse(storedAuth) : null;
  const role = auth?.user?.role;
  const apiBaseUrl = (__API_BASE_URL__ || '').replace(/\/$/, '');

  const [documents, setDocuments] = useState<PolicyDocument[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    type: 'policy' as DocumentType,
    category: 'General',
    description: '',
    text: '',
  });

  const authHeaders = useMemo(() => ({
    'Content-Type': 'application/json',
    'x-user-id': auth?.user?.id || '',
    'x-user-role': role || '',
    'x-user-email': auth?.user?.email || '',
  }), [auth?.user?.email, auth?.user?.id, role]);

  useEffect(() => {
    if (!auth?.token || !auth?.user) {
      navigate('/login', { replace: true });
      return;
    }

    if (role !== 'admin' && role !== 'directivo') {
      navigate(`/dashboard/${role || 'profesor'}`, { replace: true });
    }
  }, [auth?.token, auth?.user, navigate, role]);

  const loadDocuments = async () => {
    if (!auth?.user || (role !== 'admin' && role !== 'directivo')) return;

    setIsLoadingDocuments(true);
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/policies/documents`, {
        headers: authHeaders,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.details || data.error || 'No se pudieron cargar los documentos.');
      }

      setDocuments(data.data || []);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudieron cargar los documentos.');
    } finally {
      setIsLoadingDocuments(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [apiBaseUrl, authHeaders, auth?.user, role]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.match(/\.(txt|md)$/i)) {
      setError('Por ahora carga archivos .txt o .md, o pega el contenido del PDF/DOCX en el campo de texto.');
      return;
    }

    const text = await file.text();
    const baseName = file.name.replace(/\.(txt|md)$/i, '').replace(/[-_]/g, ' ');
    setForm((current) => ({
      ...current,
      name: current.name || baseName,
      text,
    }));
    setError(null);
  };

  const handleUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(null);
    setError(null);

    if (!form.name.trim() || !form.category.trim() || !form.text.trim()) {
      setError('Completa titulo, categoria y contenido antes de cargar.');
      return;
    }

    setIsUploading(true);

    try {
      const response = await fetch(`${apiBaseUrl}/api/policies/documents`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: form.name.trim(),
          type: form.type,
          category: form.category.trim(),
          description: form.description.trim() || undefined,
          text: form.text.trim(),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.details || data.error || 'No se pudo cargar el documento.');
      }

      setNotice(`Documento cargado: ${data.data.name}`);
      setForm({ name: '', type: 'policy', category: 'General', description: '', text: '' });
      setIsUploadOpen(false);
      await loadDocuments();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo cargar el documento.');
    } finally {
      setIsUploading(false);
    }
  };

  const stats = [
    { label: 'Documentos activos', value: documents.length.toString(), trend: isLoadingDocuments ? 'Actualizando' : 'En linea', color: 'var(--primary-blue)' },
    { label: 'Tipos registrados', value: new Set(documents.map((doc) => doc.type)).size.toString(), trend: 'Repositorio', color: 'var(--accent-gold)' },
    { label: 'Rol actual', value: role || '-', trend: 'Permisos', color: 'var(--action-green)' },
    { label: 'Carga IA', value: 'Lista', trend: 'Texto + RAG', color: '#ef4444' },
  ];

  return (
    <Layout role={role || 'directivo'} title="Portal de Gobernanza y Decisiones">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {stats.map((stat, i) => (
          <div key={i} style={{
            padding: '1.25rem',
            backgroundColor: 'var(--white)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-sm)',
            border: '1px solid var(--nickel-medium)',
            borderTop: `4px solid ${stat.color}`,
          }}>
            <div style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '0.5rem', fontWeight: 600 }}>{stat.label}</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: 'var(--text-dark)' }}>{stat.value}</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.35rem' }}>{stat.trend}</div>
            </div>
          </div>
        ))}
      </div>

      {notice && <div style={{ marginBottom: '1rem', padding: '0.85rem 1rem', border: '1px solid #bbf7d0', backgroundColor: '#f0fdf4', color: '#166534', borderRadius: 'var(--radius-md)' }}>{notice}</div>}
      {error && <div style={{ marginBottom: '1rem', padding: '0.85rem 1rem', border: '1px solid #fecaca', backgroundColor: '#fef2f2', color: '#991b1b', borderRadius: 'var(--radius-md)' }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)', gap: '1.5rem' }}>
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Gestion de Politicas</h2>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={loadDocuments}
                style={{ backgroundColor: 'var(--white)', color: 'var(--primary-blue)', border: '1px solid var(--primary-blue)', padding: '0.55rem 0.9rem', borderRadius: 'var(--radius-md)', fontWeight: 600, fontSize: '0.875rem' }}
              >
                Actualizar
              </button>
              <button
                onClick={() => setIsUploadOpen(true)}
                style={{ backgroundColor: 'var(--action-green)', color: 'var(--white)', border: 'none', padding: '0.55rem 1rem', borderRadius: 'var(--radius-md)', fontWeight: 600, fontSize: '0.875rem' }}
              >
                + Cargar Documento
              </button>
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--white)', borderRadius: 'var(--radius-md)', border: '1px solid var(--nickel-medium)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead style={{ backgroundColor: 'var(--nickel-light)', fontSize: '0.8125rem' }}>
                <tr>
                  <th style={{ padding: '0.85rem' }}>Titulo</th>
                  <th style={{ padding: '0.85rem' }}>Tipo</th>
                  <th style={{ padding: '0.85rem' }}>Categoria</th>
                  <th style={{ padding: '0.85rem' }}>Version</th>
                  <th style={{ padding: '0.85rem' }}>Estado</th>
                </tr>
              </thead>
              <tbody style={{ fontSize: '0.875rem' }}>
                {documents.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '1rem', color: '#64748b' }}>
                      {isLoadingDocuments ? 'Cargando documentos...' : 'No hay documentos visibles para este rol.'}
                    </td>
                  </tr>
                )}
                {documents.map((document) => (
                  <tr key={document.id} style={{ borderBottom: '1px solid var(--nickel-light)' }}>
                    <td style={{ padding: '0.85rem', fontWeight: 600 }}>{document.name}</td>
                    <td style={{ padding: '0.85rem' }}>{typeLabels[document.type] || document.type}</td>
                    <td style={{ padding: '0.85rem' }}>{document.category}</td>
                    <td style={{ padding: '0.85rem' }}>{document.version}</td>
                    <td style={{ padding: '0.85rem' }}>
                      <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', backgroundColor: '#ecfdf5', color: '#047857', border: '1px solid #bbf7d0' }}>
                        {document.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Consultas Frecuentes</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[
              { topic: 'Inasistencias y justificativos', count: 45 },
              { topic: 'Uso de dispositivos moviles', count: 32 },
              { topic: 'Protocolo de seguridad', count: 28 },
              { topic: 'Criterios de evaluacion', count: 19 },
            ].map((topic, i) => (
              <div key={i} style={{ padding: '0.9rem', backgroundColor: 'var(--white)', borderRadius: 'var(--radius-md)', border: '1px solid var(--nickel-medium)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                <span style={{ fontSize: '0.875rem' }}>{topic.topic}</span>
                <span style={{ fontWeight: 'bold', color: 'var(--primary-blue)', backgroundColor: 'var(--nickel-light)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>{topic.count}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {isUploadOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 1000 }}>
          <form onSubmit={handleUpload} style={{ width: 'min(760px, 100%)', maxHeight: '92vh', overflowY: 'auto', backgroundColor: 'var(--white)', borderRadius: 'var(--radius-md)', border: '1px solid var(--nickel-medium)', boxShadow: 'var(--shadow-md)' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--nickel-medium)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Cargar documento actualizado</h2>
              <button type="button" onClick={() => setIsUploadOpen(false)} style={{ background: 'transparent', border: '1px solid var(--nickel-medium)', borderRadius: 'var(--radius-md)', padding: '0.35rem 0.65rem' }}>
                Cerrar
              </button>
            </div>

            <div style={{ padding: '1.25rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.875rem', fontWeight: 600 }}>
                Titulo
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ej. Politica de evaluacion 2026" />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.875rem', fontWeight: 600 }}>
                Categoria
                <input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Ej. Academico" />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.875rem', fontWeight: 600 }}>
                Tipo
                <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as DocumentType })} style={{ border: '1px solid var(--nickel-medium)', borderRadius: 'var(--radius-md)', padding: '0.55rem 0.75rem', fontFamily: 'inherit' }}>
                  <option value="policy">Politica</option>
                  <option value="manual">Manual</option>
                  <option value="procedure">Procedimiento</option>
                  <option value="handbook">Guia</option>
                  <option value="other">Otro</option>
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.875rem', fontWeight: 600 }}>
                Archivo .txt/.md
                <input type="file" accept=".txt,.md,text/plain,text/markdown" onChange={handleFileChange} style={{ padding: '0.45rem' }} />
              </label>

              <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.875rem', fontWeight: 600 }}>
                Descripcion
                <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Resumen breve del documento" />
              </label>

              <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.875rem', fontWeight: 600 }}>
                Contenido
                <textarea
                  value={form.text}
                  onChange={(event) => setForm({ ...form, text: event.target.value })}
                  placeholder="Pega aqui el contenido actualizado de la politica o carga un .txt/.md."
                  style={{ minHeight: 220, resize: 'vertical', border: '1px solid var(--nickel-medium)', borderRadius: 'var(--radius-md)', padding: '0.75rem', fontFamily: 'inherit', lineHeight: 1.5 }}
                />
              </label>
            </div>

            <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--nickel-medium)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button type="button" onClick={() => setIsUploadOpen(false)} style={{ backgroundColor: 'var(--white)', color: 'var(--text-dark)', border: '1px solid var(--nickel-medium)', padding: '0.65rem 1rem', borderRadius: 'var(--radius-md)', fontWeight: 600 }}>
                Cancelar
              </button>
              <button type="submit" disabled={isUploading} style={{ backgroundColor: 'var(--primary-blue)', color: 'var(--white)', border: 'none', padding: '0.65rem 1rem', borderRadius: 'var(--radius-md)', fontWeight: 600, opacity: isUploading ? 0.7 : 1 }}>
                {isUploading ? 'Cargando...' : 'Cargar al repositorio'}
              </button>
            </div>
          </form>
        </div>
      )}
    </Layout>
  );
};

export default AdminPanel;
