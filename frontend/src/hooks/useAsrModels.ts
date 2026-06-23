import { useEffect, useState } from 'react';
import axios from 'axios';
import { apiUrl } from '../api';
import type { AsrModel } from '../types';

const FALLBACK: AsrModel[] = [
  { id: 'tiny', name: 'Tiny' },
  { id: 'base', name: 'Base' },
  { id: 'small', name: 'Small' },
  { id: 'medium', name: 'Medium' },
  { id: 'large-v3', name: 'Large v3' },
];

export function useAsrModels() {
  const [models, setModels] = useState<AsrModel[]>(FALLBACK);

  useEffect(() => {
    axios
      .get(apiUrl('/api/asr-models'))
      .then(res => setModels(res.data.models))
      .catch(() => setModels(FALLBACK));
  }, []);

  return models;
}
