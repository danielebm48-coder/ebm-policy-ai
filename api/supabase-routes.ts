import express from 'express';
import { supabaseClient, supabaseAdmin } from '../src/supabase';
import { normalizeText } from '../src/utils/encoding';
import { Policy, User } from '../src/supabase-types';

const router = express.Router();

/**
 * GET /api/policies - Obtener todas las políticas
 */
router.get('/policies', async (req, res) => {
  try {
    const { data, error } = await supabaseClient
      .from('policies')
      .select('*');

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/policies/:id - Obtener una política específica
 */
router.get('/policies/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseClient
      .from('policies')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Policy not found' });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/policies - Crear una nueva política (admin only)
 */
router.post('/policies', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Admin client not configured' });
    }

    const incoming: Policy = req.body;
    const policy: Policy = {
      ...incoming,
      title: normalizeText(incoming.title),
      summary: normalizeText((incoming as any).summary || ''),
      content: normalizeText((incoming as any).content || ''),
    };

    const { data, error } = await supabaseAdmin
      .from('policies')
      .insert([policy])
      .select();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.status(201).json(data[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/policies/:id - Actualizar una política
 */
router.put('/policies/:id', async (req, res) => {
  try {
    const incoming = req.body;
    const updates = {
      ...incoming,
      title: normalizeText((incoming as any).title || ''),
      summary: normalizeText((incoming as any).summary || ''),
      content: normalizeText((incoming as any).content || ''),
    };

    const { data, error } = await supabaseClient
      .from('policies')
      .update(updates)
      .eq('id', req.params.id)
      .select();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/policies/:id - Eliminar una política
 */
router.delete('/policies/:id', async (req, res) => {
  try {
    const { error } = await supabaseClient
      .from('policies')
      .delete()
      .eq('id', req.params.id);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/users - Obtener todos los usuarios
 */
router.get('/users', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Admin client not configured' });
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*');

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
