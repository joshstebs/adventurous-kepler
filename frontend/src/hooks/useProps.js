import { useState, useEffect } from 'react';
import API_URL from '../api';

/**
 * useProps – custom hook that fetches prop and moneyline predictions
 * from the Express backend for the selected sport.
 *
 * @param {string} sport - One of 'MLB', 'NFL', 'NHL', 'NBA'
 * @returns {{ propData: Array, moneylineData: Array, loading: boolean, error: string|null }}
 */
function useProps(sport) {
  const [propData, setPropData] = useState([]);
  const [moneylineData, setMoneylineData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!sport) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setPropData([]);
    setMoneylineData([]);

    const url = `${API_URL}/api/${sport.toLowerCase()}`;

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;

        // The backend returns { prop_predictions: [...], moneyline_predictions: [...] }
        const props = json.prop_predictions || json.props || (Array.isArray(json) ? json : []);
        const moneyline = json.moneyline_predictions || json.moneyline || [];

        setPropData(Array.isArray(props) ? props : []);
        setMoneylineData(Array.isArray(moneyline) ? moneyline : []);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[useProps] fetch error:', err);
        setError(err.message);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sport]);

  return { propData, moneylineData, loading, error };
}

export default useProps;
