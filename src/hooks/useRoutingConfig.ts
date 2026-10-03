import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { RoutingConfig } from '@/lib/types';

export function useRoutingConfig() {
  const [config, setConfig] = useState<RoutingConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('routing_config')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        setConfig(data as RoutingConfig | null);
        setLoading(false);
      });
  }, []);

  return { config, setConfig, loading };
}
