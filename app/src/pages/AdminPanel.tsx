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
  status: 'active' | 'archived' | 'draft' | 'review';
  version: number;
  last_updated?: string;
  upload_date?: string;
  text?: string;
}

interface UnansweredQuery {
  id: string;
  user_id: string;
  user_role: string;
  question: string;
  requested_at: string;
  status: string;
}

interface QueryStatistics {
  total: number;
  errors: number;
  average_rating: number;
  by_role: Record<string, number>;
  unanswered: number;
  most_consulted: Array<{ id: string; name: string; count: number }>;
}

const typeLabels: Record<DocumentType, string> = {
  policy: 'Politica',
  manual: 'Manual',
  procedure: 'Procedimiento',
  handbook: 'Guia',
  other: 'Otro',
};

const statusLabels: Record<string, string> = {
  active: 'Cargado',
  archived: 'Archivado',
  draft: 'Borrador',
  review: 'En Revision',
};

const statusColors: Record<string, string> = {
  active: '#ecfdf5',
  archived: '#f1f5f9',
  draft: '#fffbeb',
  review: '#eff6ff',
};

const statusTextColors: Record<string, string> = {
  active: '#047857',
  archived: '#475569',
  draft: '#b45309',
  review: '#1d4ed8',
};

const AdminPanel: React.FC = () => {
  const navigate = useNavigate();
  const auth = useMemo(() => {
    const storedAuth = localStorage.getItem('schoolPolicyAuth');
    return storedAuth ? JSON.parse(storedAuth) : null;
  }, []);
  const role = auth?.user?.role;
  const apiBaseUrl = (__API_BASE_URL__ || '').replace(/\/$/, '');

  const [documents, setDocuments] = useState<PolicyDocument[]>([]);
  const [unansweredQueries, setUnansweredQueries] = useState<UnansweredQuery[]>([]);
  const [statistics, setStatistics] = useState<QueryStatistics | null>(null);
  const [recommendations, setRecommendations] = useState<string | null>(null);
  const [insights, setInsights] = useState<any | null>(null);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [isLoadingUnanswered, setIsLoadingUnanswered] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isLoadingRecs, setIsLoadingRecs] = useState(false);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null);
  const [busyDocumentId, setBusyDocumentId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    type: 'policy' as DocumentType,
    category: 'General',
    description: '',
    text: '',
  });
  const [permissions, setPermissions] = useState<Record<string, boolean>>({
    admin: true,
    directivo: true,
    profesor: true,
    alumno: true,
    padre: true,
  });

  const authHeaders = useMemo(() => ({
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
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
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

  const loadUnansweredQueries = async () => {
    if (!auth?.user || (role !== 'admin' && role !== 'directivo')) return;

    setIsLoadingUnanswered(true);

    try {
      const response = await fetch(`${apiBaseUrl}/api/policies/admin/unanswered?limit=12`, {
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.details || data.error || 'No se pudieron cargar las consultas sin respuesta.');
      }

      setUnansweredQueries(data.data || []);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudieron cargar las consultas sin respuesta.');
    } finally {
      setIsLoadingUnanswered(false);
    }
  };

  const loadStatistics = async () => {
    if (!auth?.user || (role !== 'admin' && role !== 'directivo')) return;

    setIsLoadingStats(true);

    try {
      const response = await fetch(`${apiBaseUrl}/api/policies/admin/statistics`, {
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.details || data.error || 'No se pudieron cargar las estadisticas.');
      }

      setStatistics(data.data || null);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudieron cargar las estadisticas.');
    } finally {
      setIsLoadingStats(false);
    }
  };

  const loadRecommendations = async () => {
    if (!auth?.user || (role !== 'admin' && role !== 'directivo')) return;

    setIsLoadingRecs(true);

    try {
      const response = await fetch(`${apiBaseUrl}/api/policies/admin/recommendations`, {
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.details || data.error || 'No se pudieron cargar las recomendaciones.');
      }

      setRecommendations(data.data || null);
    } catch (error) {
      console.error('Error loading recommendations:', error);
    } finally {
      setIsLoadingRecs(false);
    }
  };

  const loadInsights = async () => {
    if (!auth?.user || (role !== 'admin' && role !== 'directivo')) return;

    setIsLoadingInsights(true);

    try {
      const response = await fetch(`${apiBaseUrl}/api/policies/admin/insights`, {
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.details || data.error || 'No se pudieron cargar los insights.');
      }

      setInsights(data.data || null);
    } catch (error) {
      console.error('Error loading insights:', error);
    } finally {
      setIsLoadingInsights(false);
    }
  };

  useEffect(() => {
    loadDocuments();
    loadUnansweredQueries();
    loadStatistics();
    loadRecommendations();
    loadInsights();
  }, [apiBaseUrl, authHeaders, auth?.user?.id, role]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) handleFileSelected(file);
  };

  const handleFileSelected = async (file: File) => {
    setSelectedFile(file);
    const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, ' ');
    setForm((current) => ({
      ...current,
      name: current.name || baseName,
    }));
    
    if (file.name.match(/\.(txt|md)$/i)) {
      const text = await file.text();
      setForm((current) => ({ ...current, text }));
    } else {
      setForm((current) => ({ ...current, text: '(Archivo binario detectado. Se procesara en el servidor)' }));
    }
    setError(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelected(file);
  };

  const openCreateModal = () => {
    setEditingDocumentId(null);
    setSelectedFile(null);
    setForm({ name: '', type: 'policy', category: 'General', description: '', text: '' });
    setPermissions({
      admin: true,
      directivo: true,
      profesor: true,
      alumno: true,
      padre: true,
    });
    setNotice(null);
    setError(null);
    setIsUploadOpen(true);
  };

  const openEditModal = async (documentId: string) => {
    setNotice(null);
    setError(null);
    setBusyDocumentId(documentId);
    setSelectedFile(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/policies/documents/${documentId}`, {
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.details || data.error || 'No se pudo cargar el documento.');
      }

      const document = data.data as PolicyDocument;
      setEditingDocumentId(document.id);
      setForm({
        name: document.name || '',
        type: document.type || 'policy',
        category: document.category || 'General',
        description: document.description || '',
        text: document.text || '',
      });

      // Consultar permisos especificos
      const permResponse = await fetch(`${apiBaseUrl}/api/policies/debug/knowledge`, {
        headers: { ...authHeaders },
      });
      const permData = await permResponse.json();
      
      const docPerms = (permData.data?.accessPolicies?.sample || [])
        .filter((p: any) => p.document_id === documentId);
      
      if (docPerms.length > 0) {
        const newPerms = { admin: false, directivo: false, profesor: false, alumno: false, padre: false } as any;
        docPerms.forEach((p: any) => {
          if (newPerms.hasOwnProperty(p.role_id)) newPerms[p.role_id] = p.access_level !== 'none';
        });
        setPermissions(newPerms);
      } else {
        setPermissions({ admin: true, directivo: true, profesor: true, alumno: true, padre: true });
      }

      setIsUploadOpen(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo cargar el documento.');
    } finally {
      setBusyDocumentId(null);
    }
  };

  const changeStatus = async (documentId: string, status: string) => {
    setNotice(null);
    setError(null);
    setBusyDocumentId(documentId);

    try {
      const response = await fetch(`${apiBaseUrl}/api/policies/documents/${documentId}/status`, {
        method: 'PATCH',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'No se pudo cambiar el estado.');

      setNotice(`Estado actualizado a: ${statusLabels[status] || status}`);
      await loadDocuments();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Error al cambiar estado.');
    } finally {
      setBusyDocumentId(null);
    }
  };

  const deleteDocument = async (documentId: string) => {
    if (!confirm('¿Seguro que quieres archivar este documento? Dejara de estar disponible para consultas.')) return;

    setNotice(null);
    setError(null);
    setBusyDocumentId(documentId);

    try {
      const response = await fetch(`${apiBaseUrl}/api/policies/documents/${documentId}`, {
        method: 'DELETE',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'No se pudo archivar el documento.');

      setNotice('Documento archivado correctamente.');
      await loadDocuments();
      await loadStatistics();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Error al archivar.');
    } finally {
      setBusyDocumentId(null);
    }
  };

  const handleSaveDocument = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(null);
    setError(null);

    if (!form.name.trim() || !form.category.trim()) {
      setError('Completa titulo y categoria antes de cargar.');
      return;
    }

    setIsUploading(true);

    try {
      let response;
      const payloadPermissions = Object.entries(permissions)
        .filter(([_, allowed]) => allowed)
        .map(([role]) => role);

      if (selectedFile && !editingDocumentId) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('type', form.type);
        formData.append('category', form.category);
        formData.append('description', form.description);
        formData.append('permissions', JSON.stringify(payloadPermissions));
        
        response = await fetch(`${apiBaseUrl}/api/policies/documents/upload`, {
          method: 'POST',
          headers: authHeaders,
          body: formData,
        });
      } else {
        response = await fetch(
          editingDocumentId
            ? `${apiBaseUrl}/api/policies/documents/${editingDocumentId}`
            : `${apiBaseUrl}/api/policies/documents`,
          {
            method: editingDocumentId ? 'PATCH' : 'POST',
            headers: { ...authHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: form.name.trim(),
              type: form.type,
              category: form.category.trim(),
              description: form.description.trim() || undefined,
              text: form.text.trim(),
              permissions: payloadPermissions,
            }),
          }
        );
      }
      
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.details || data.error || 'No se pudo guardar el documento.');
      }

      setNotice(editingDocumentId ? `Documento actualizado: ${data.data.name}` : `Documento cargado: ${data.data.name}`);
      setForm({ name: '', type: 'policy', category: 'General', description: '', text: '' });
      setEditingDocumentId(null);
      setSelectedFile(null);
      setIsUploadOpen(false);
      await loadDocuments();
      await loadUnansweredQueries();
      await loadStatistics();
      await loadRecommendations();
      await loadInsights();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo guardar el documento.');
    } finally {
      setIsUploading(false);
    }
  };

  const stats = [
    { label: 'Documentos activos', value: documents.filter(d => d.status === 'active').length.toString(), trend: isLoadingDocuments ? 'Actualizando' : 'En linea', color: 'var(--primary-blue)' },
    { label: 'Consultas totales', value: (statistics?.total ?? 0).toString(), trend: isLoadingStats ? 'Actualizando' : 'Historial IA', color: 'var(--action-green)' },
    { label: 'Sin respuesta', value: (statistics?.unanswered ?? 0).toString(), trend: statistics ? `${statistics.errors} errores` : 'Por mejorar', color: '#ef4444' },
    { label: 'Calificacion promedio', value: (statistics?.average_rating ?? 0).toFixed(1), trend: 'Satisfaccion', color: 'var(--accent-gold)' },
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

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(300px, 1fr)', gap: '1.5rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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
                  onClick={openCreateModal}
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
                    <th style={{ padding: '0.85rem' }}>Estado</th>
                    <th style={{ padding: '0.85rem' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody style={{ fontSize: '0.875rem' }}>
                  {documents.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ padding: '1rem', color: '#64748b' }}>
                        {isLoadingDocuments ? 'Cargando documentos...' : 'No hay documentos visibles para este rol.'}
                      </td>
                    </tr>
                  )}
                  {documents.filter(d => d.status !== 'archived').map((document) => (
                    <tr key={document.id} style={{ borderBottom: '1px solid var(--nickel-light)' }}>
                      <td style={{ padding: '0.85rem', fontWeight: 600 }}>{document.name}</td>
                      <td style={{ padding: '0.85rem' }}>{typeLabels[document.type] || document.type}</td>
                      <td style={{ padding: '0.85rem' }}>
                        <select 
                          value={document.status} 
                          onChange={(e) => changeStatus(document.id, e.target.value)}
                          disabled={busyDocumentId === document.id}
                          style={{ 
                            padding: '0.2rem 0.4rem', 
                            borderRadius: '4px', 
                            fontSize: '0.75rem', 
                            backgroundColor: statusColors[document.status], 
                            color: statusTextColors[document.status], 
                            border: `1px solid ${statusTextColors[document.status]}44`,
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          <option value="draft">Borrador</option>
                          <option value="review">En Revision</option>
                          <option value="active">Cargado</option>
                        </select>
                      </td>
                      <td style={{ padding: '0.85rem' }}>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => openEditModal(document.id)}
                            disabled={busyDocumentId === document.id}
                            style={{ backgroundColor: 'var(--white)', color: 'var(--primary-blue)', border: '1px solid var(--primary-blue)', padding: '0.35rem 0.55rem', borderRadius: 'var(--radius-md)', fontSize: '0.75rem', fontWeight: 600, opacity: busyDocumentId === document.id ? 0.65 : 1 }}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteDocument(document.id)}
                            disabled={busyDocumentId === document.id}
                            style={{ backgroundColor: 'var(--white)', color: '#ef4444', border: '1px solid #ef4444', padding: '0.35rem 0.55rem', borderRadius: 'var(--radius-md)', fontSize: '0.75rem', fontWeight: 600, opacity: busyDocumentId === document.id ? 0.65 : 1 }}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Sugerencias de la IA para Documentacion</h2>
            <div style={{ 
              padding: '1.25rem', 
              backgroundColor: '#f8fafc', 
              borderRadius: 'var(--radius-md)', 
              border: '1px solid #e2e8f0',
              fontSize: '0.925rem',
              lineHeight: 1.6,
              color: 'var(--text-dark)'
            }}>
              {isLoadingRecs ? 'Analizando consultas sin respuesta...' : (
                <div dangerouslySetInnerHTML={{ __html: (recommendations || 'No hay recomendaciones suficientes todavia.').replace(/\n/g, '<br/>') }} />
              )}
            </div>
          </section>

          <section style={{ marginTop: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Analisis de Grupos de Interes (Direccion)</h2>
            <div style={{ 
              padding: '1.25rem', 
              backgroundColor: '#f1f5f9', 
              borderRadius: 'var(--radius-md)', 
              border: '1px solid #cbd5e1',
              fontSize: '0.925rem',
              lineHeight: 1.6,
              color: 'var(--text-dark)'
            }}>
              {isLoadingInsights ? 'Generando analisis estrategico...' : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                    {(insights?.roleStats || []).map((s: any) => (
                      <div key={s.role} style={{ backgroundColor: 'var(--white)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>{s.role.toUpperCase()}</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{s.count} q</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--action-green)' }}>★ {s.avgRating.toFixed(1)}</div>
                      </div>
                    ))}
                  </div>
                  <div dangerouslySetInnerHTML={{ __html: (insights?.strategicAnalysis || 'No hay datos de analisis todavia.').replace(/\n/g, '<br/>') }} />
                </>
              )}
            </div>
          </section>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Mas consultados</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {(statistics?.most_consulted || []).length === 0 && (
                <div style={{ padding: '0.9rem', backgroundColor: 'var(--white)', borderRadius: 'var(--radius-md)', border: '1px solid var(--nickel-medium)', color: '#64748b', fontSize: '0.875rem' }}>
                  Sin datos de consulta.
                </div>
              )}
              {statistics?.most_consulted.map((doc) => (
                <div key={doc.id} style={{ padding: '0.9rem', backgroundColor: 'var(--white)', borderRadius: 'var(--radius-md)', border: '1px solid var(--nickel-medium)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{doc.name}</span>
                  <span style={{ fontSize: '0.75rem', backgroundColor: 'var(--nickel-light)', padding: '0.2rem 0.5rem', borderRadius: '1rem' }}>{doc.count} queries</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Sin respuesta IA</h2>
              <button
                onClick={loadUnansweredQueries}
                style={{ backgroundColor: 'var(--white)', color: 'var(--primary-blue)', border: '1px solid var(--primary-blue)', padding: '0.4rem 0.65rem', borderRadius: 'var(--radius-md)', fontWeight: 600, fontSize: '0.75rem' }}
              >
                Refrescar
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {unansweredQueries.length === 0 && (
                <div style={{ padding: '0.9rem', backgroundColor: 'var(--white)', borderRadius: 'var(--radius-md)', border: '1px solid var(--nickel-medium)', color: '#64748b', fontSize: '0.875rem' }}>
                  {isLoadingUnanswered ? 'Cargando...' : 'Todo cubierto.'}
                </div>
              )}
              {unansweredQueries.map((query) => (
                <div key={query.id} style={{ padding: '0.9rem', backgroundColor: 'var(--white)', borderRadius: 'var(--radius-md)', border: '1px solid var(--nickel-medium)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{query.question}</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.7rem' }}>
                    <span>{query.user_role}</span>
                    <span>{new Date(query.requested_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {isUploadOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 1000 }}>
          <form onSubmit={handleSaveDocument} style={{ width: 'min(760px, 100%)', maxHeight: '92vh', overflowY: 'auto', backgroundColor: 'var(--white)', borderRadius: 'var(--radius-md)', border: '1px solid var(--nickel-medium)', boxShadow: 'var(--shadow-md)' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--nickel-medium)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.15rem' }}>{editingDocumentId ? 'Actualizar documento' : 'Cargar documento'}</h2>
              <button type="button" onClick={() => { setIsUploadOpen(false); setEditingDocumentId(null); }} style={{ background: 'transparent', border: '1px solid var(--nickel-medium)', borderRadius: 'var(--radius-md)', padding: '0.35rem 0.65rem' }}>
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

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem', fontWeight: 600 }}>
                  Arrastra un archivo o haz clic para subir (.pdf, .docx, .txt, .md)
                </label>
                <div 
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('file-input')?.click()}
                  style={{ 
                    border: `2px dashed ${isDragging ? 'var(--primary-blue)' : 'var(--nickel-medium)'}`, 
                    borderRadius: 'var(--radius-md)', 
                    padding: '2rem', 
                    textAlign: 'center',
                    backgroundColor: isDragging ? '#f0f9ff' : '#f8fafc',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <input id="file-input" type="file" accept=".pdf,.docx,.doc,.txt,.md" onChange={handleFileChange} style={{ display: 'none' }} />
                  {selectedFile ? (
                    <div style={{ color: 'var(--primary-blue)', fontWeight: 600 }}>
                      📄 {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </div>
                  ) : (
                    <div style={{ color: '#64748b' }}>
                      Arrastra aqui tus documentos PDF, Word o Texto
                    </div>
                  )}
                </div>
              </div>

              <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.875rem', fontWeight: 600 }}>
                Descripcion
                <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Resumen breve del documento" />
              </label>

              <div style={{ gridColumn: '1 / -1', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid var(--nickel-medium)' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--metallic-green-dark)' }}>
                  Permisos de Acceso (¿Quien puede consultar este documento?)
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                  {Object.entries({
                    admin: 'Administradores',
                    directivo: 'Directivos',
                    profesor: 'Profesores',
                    alumno: 'Alumnos',
                    padre: 'Padres'
                  }).map(([id, label]) => (
                    <label key={id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={permissions[id]} 
                        onChange={(e) => setPermissions({ ...permissions, [id]: e.target.checked })}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {(!selectedFile || editingDocumentId) && (
                <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.875rem', fontWeight: 600 }}>
                  Contenido
                  <textarea
                    value={form.text}
                    onChange={(event) => setForm({ ...form, text: event.target.value })}
                    placeholder="Pega aqui el contenido actualizado de la politica o carga un archivo."
                    style={{ minHeight: 180, resize: 'vertical', border: '1px solid var(--nickel-medium)', borderRadius: 'var(--radius-md)', padding: '0.75rem', fontFamily: 'inherit', lineHeight: 1.5 }}
                  />
                </label>
              )}
            </div>

            <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--nickel-medium)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button type="button" onClick={() => { setIsUploadOpen(false); setEditingDocumentId(null); }} style={{ backgroundColor: 'var(--white)', color: 'var(--text-dark)', border: '1px solid var(--nickel-medium)', padding: '0.65rem 1rem', borderRadius: 'var(--radius-md)', fontWeight: 600 }}>
                Cancelar
              </button>
              <button type="submit" disabled={isUploading} style={{ backgroundColor: 'var(--primary-blue)', color: 'var(--white)', border: 'none', padding: '0.65rem 1rem', borderRadius: 'var(--radius-md)', fontWeight: 600, opacity: isUploading ? 0.7 : 1 }}>
                {isUploading ? 'Guardando...' : editingDocumentId ? 'Actualizar documento' : 'Cargar al repositorio'}
              </button>
            </div>
          </form>
        </div>
      )}
    </Layout>
  );
};

export default AdminPanel;
