import { useState, useEffect } from "react";
import { format } from "date-fns";

export function useTime() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    // Update exactly on the second
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return {
    timeDisplay: format(time, "h:mm a"),
    dateDisplay: format(time, "EEE, MMM d"),
  };
}
