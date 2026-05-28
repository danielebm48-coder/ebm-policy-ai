import React, { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import Layout from '../components/Layout';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  reference?: string;
  timestamp: Date;
}

const RoleDashboard: React.FC = () => {
  const { role } = useParams<{ role: string }>();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: `¡Hola! Soy tu Asistente de Políticas Escolares. Como ${role}, ¿en qué puedo ayudarte hoy respecto a la normativa?`,
      sender: 'ai',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isTyping) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputValue,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentQuery = inputValue;
    setInputValue('');
    setIsTyping(true);

    try {
      // Llamada real al backend de E.B. Maquilishuat
      const response = await fetch('/api/policies/ask', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': 'u_test_user',
          'x-user-role': role || 'profesor',
          'x-user-email': `${role}@escuela.com`
        },
        body: JSON.stringify({
          question: currentQuery
        })
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Error en la respuesta del servidor');

      const result = data.data; // El backend envuelve el resultado en 'data'

      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: result.answer,
        sender: 'ai',
        reference: result.sourceDocuments && result.sourceDocuments.length > 0 
          ? `Documentos: ${result.sourceDocuments.join(', ')}` 
          : "Base de Conocimiento EBM",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiResponse]);
    } catch (error) {
      console.error('Error en consulta:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: `Error de conexión: ${error instanceof Error ? error.message : 'Error desconocido'}. Por favor, verifica la configuración de Supabase y Gemini en Render.`,
        sender: 'ai',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <Layout role={role} title="Consulta Normativa Inteligente">
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 250px)', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: '1.5rem', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '1.5rem',
          backgroundColor: '#f8fafc',
          borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
          border: '1px solid var(--nickel-medium)',
          borderBottom: 'none'
        }}>
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              style={{ 
                alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start'
              }}
            >
              <div style={{ 
                padding: '1rem 1.25rem', 
                borderRadius: msg.sender === 'user' ? '18px 18px 2px 18px' : '18px 18px 18px 2px',
                backgroundColor: msg.sender === 'user' ? 'var(--nickel-light)' : 'var(--white)',
                color: 'var(--text-dark)',
                boxShadow: 'var(--shadow-sm)',
                border: msg.sender === 'user' ? '1px solid var(--nickel-medium)' : '1px solid var(--primary-blue)',
                position: 'relative'
              }}>
                {msg.text}
                {msg.reference && (
                  <div style={{ 
                    marginTop: '0.75rem', 
                    paddingTop: '0.75rem', 
                    borderTop: '1px solid var(--nickel-light)',
                    fontSize: '0.75rem',
                    color: 'var(--accent-gold)',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <span style={{ 
                      display: 'inline-block', 
                      width: '6px', 
                      height: '6px', 
                      backgroundColor: 'var(--accent-gold)', 
                      borderRadius: '50%' 
                    }}></span>
                    {msg.reference}
                  </div>
                )}
              </div>
              <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
          {isTyping && (
            <div style={{ alignSelf: 'flex-start', backgroundColor: 'var(--white)', padding: '0.75rem 1.25rem', borderRadius: '18px', border: '1px solid var(--primary-blue)', boxShadow: 'var(--shadow-sm)' }}>
              <span style={{ color: 'var(--primary-blue)', fontSize: '0.875rem', fontStyle: 'italic' }}>La IA está consultando las políticas...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form 
          onSubmit={handleSend}
          style={{ 
            display: 'flex', 
            padding: '1.25rem', 
            backgroundColor: 'var(--white)', 
            border: '1px solid var(--nickel-medium)',
            borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
            gap: '1rem',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
          }}
        >
          <input 
            type="text" 
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Escribe tu consulta sobre las normas de la escuela..."
            style={{ flex: 1, border: '1px solid var(--nickel-medium)' }}
          />
          <button 
            type="submit"
            style={{ 
              backgroundColor: 'var(--action-green)', 
              color: 'var(--white)', 
              border: 'none', 
              padding: '0.5rem 1.5rem', 
              borderRadius: 'var(--radius-md)',
              fontWeight: 600
            }}
          >
            Preguntar
          </button>
        </form>
      </div>
    </Layout>
  );
};

export default RoleDashboard;
