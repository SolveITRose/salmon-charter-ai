// No more OWM_KEY here! Security risk fixed.
const PROXY_URL = "http://192.168.2.87:8000/conditions"; 

export interface TripConditions {
  // ... Keep your existing interface here ...
}

export async function fetchTripConditions(
  lat: number,
  lng: number,
  date: string,
): Promise<TripConditions> {
  try {
    // ONE call replaces the previous 11.
    const response = await fetch(`${PROXY_URL}?lat=${lat}&lng=${lng}`);
    
    if (!response.ok) {
      throw new Error(`Proxy error: ${response.status}`);
    }

    const data: TripConditions = await response.json();
    return data;
  } catch (err) {
    console.error("[Proxy] Combined fetch failed:", err);
    throw err; // Handle UI-side error state
  }
}