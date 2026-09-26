import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useToast } from './Toast.jsx';
import PlanPicker from './PlanPicker.jsx';

/**
 * "Add to plan…" for a library item: pick a plan, and the item is added to its
 * References (a References block is made if it has none).
 * `const [picker, addToPlan] = useAddToPlan();` → render {picker}, call
 * addToPlan('project' | 'gallery', id).
 */
export function useAddToPlan() {
  const toast = useToast();
  const navigate = useNavigate();
  const [target, setTarget] = useState(null); // { kind, id }
  const [plans, setPlans] = useState([]);
  const open = useCallback((kind, id) => {
    setTarget({ kind, id });
    api.listPlans().then(setPlans).catch(() => setPlans([]));
  }, []);
  const pick = async (planId) => {
    const t = target;
    setTarget(null);
    if (!planId || !t) return;
    try {
      const { plan, added } = await api.addPlanRef(planId, t.kind, t.id);
      toast(added ? `Added to “${plan.name}” → References` : `Already in “${plan.name}”`, 'ok',
        { label: 'Open plan', onClick: () => navigate(`/plan/${plan.id}`) });
    } catch (e) { toast(`Could not add: ${e.message}`, 'error'); }
  };
  const picker = target ? <PlanPicker plans={plans} title="Add to plan" onPick={pick} onClose={() => setTarget(null)} /> : null;
  return [picker, open];
}
