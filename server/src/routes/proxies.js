import { Router } from 'express';
import { z } from 'zod';
import { Proxies, hydrateProxies } from '../db.js';
import { requireAuth, requireRole, validate } from '../middleware/auth.js';
import { advance } from '../services/matching.js';
import { declineForNoCover } from '../services/cover.js';
import { todayIST, prettyDate, PERIOD_TIMES } from '../services/dates.js';

const router = Router();
router.use(requireAuth, requireRole('faculty'));

// Requests waiting for me + proxies I have accepted
router.get('/mine', async (req, res) => {
  const today = todayIST();
  const [waiting, accepted] = await Promise.all([
    Proxies.where(`offered_to = $1 AND status = 'pending' ORDER BY date, period`, [req.user.id]).then(hydrateProxies),
    Proxies.where(`assigned_to = $1 AND date >= $2 AND leave_id IS NOT NULL ORDER BY date, period`, [req.user.id, today]).then(hydrateProxies),
  ]);
  const decorate = (p) => ({ ...p, prettyDate: prettyDate(p.date), time: PERIOD_TIMES[p.period] });
  res.json({ waiting: waiting.map(decorate), accepted: accepted.map(decorate) });
});

const RespondBody = z.object({ action: z.enum(['accept', 'decline']) });

router.post('/:id/respond', validate(RespondBody), async (req, res) => {
  const proxy = await Proxies.byId(Number(req.params.id) || 0);
  if (!proxy) return res.status(404).json({ error: 'Request not found' });
  if (proxy.status !== 'pending' || proxy.offered_to !== req.user.id) {
    return res.status(409).json({ error: 'This request is no longer waiting for you' });
  }

  if (req.body.action === 'accept') {
    proxy.assigned_to = proxy.offered_to;
    proxy.status = 'accepted';
    proxy.history.push({ faculty: proxy.offered_to, action: 'accepted', at: new Date().toISOString() });
  } else {
    advance(proxy, 'declined'); // automatically goes to the next best teacher
  }
  await Proxies.save(proxy);
  if (proxy.status === 'uncovered') {
    // every teacher of this subject said no -> the leave cannot go ahead
    await declineForNoCover(proxy.leave_id, proxy, 'declined');
    return res.json({ proxy: null, leaveDeclined: true });
  }
  const [updated] = await hydrateProxies([proxy]);
  res.json({ proxy: updated });
});

export default router;
