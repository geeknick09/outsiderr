/**
 * India states -> cities dataset for cascading pickers + geo detection.
 * Values are canonical UPPERCASE keys (same storage format as legacy
 * KOLKATA/MUMBAI/... rows); labels are display names; lat/lng feed the
 * "nearest city" geolocation fallback.
 */

export interface CityDef {
  value: string;
  label: string;
  lat: number;
  lng: number;
}

export interface StateDef {
  state: string;
  cities: CityDef[];
}

const c = (value: string, label: string, lat: number, lng: number): CityDef => ({
  value, label, lat, lng,
});

export const INDIAN_STATES_CITIES: StateDef[] = [
  { state: "Andhra Pradesh", cities: [
    c("VISAKHAPATNAM", "Visakhapatnam", 17.6868, 83.2185),
    c("VIJAYAWADA", "Vijayawada", 16.5062, 80.6480),
    c("GUNTUR", "Guntur", 16.3067, 80.4365),
    c("TIRUPATI", "Tirupati", 13.6288, 79.4192),
  ]},
  { state: "Assam", cities: [
    c("GUWAHATI", "Guwahati", 26.1445, 91.7362),
    c("DIBRUGARH", "Dibrugarh", 27.4728, 94.9120),
    c("SILCHAR", "Silchar", 24.8333, 92.7789),
  ]},
  { state: "Bihar", cities: [
    c("PATNA", "Patna", 25.5941, 85.1376),
    c("GAYA", "Gaya", 24.7955, 85.0002),
    c("MUZAFFARPUR", "Muzaffarpur", 26.1209, 85.3647),
  ]},
  { state: "Chandigarh", cities: [
    c("CHANDIGARH", "Chandigarh", 30.7333, 76.7794),
  ]},
  { state: "Chhattisgarh", cities: [
    c("RAIPUR", "Raipur", 21.2514, 81.6296),
    c("BHILAI", "Bhilai", 21.2094, 81.3785),
  ]},
  { state: "Delhi", cities: [
    c("DELHI", "Delhi", 28.6139, 77.2090),
    c("NEW DELHI", "New Delhi", 28.6139, 77.2090),
  ]},
  { state: "Goa", cities: [
    c("PANAJI", "Panaji", 15.4909, 73.8278),
    c("MARGAO", "Margao", 15.2993, 74.1240),
    c("MAPUSA", "Mapusa", 15.5915, 73.8090),
    c("VAGATOR", "Vagator", 15.5977, 73.7449),
  ]},
  { state: "Gujarat", cities: [
    c("AHMEDABAD", "Ahmedabad", 23.0225, 72.5714),
    c("SURAT", "Surat", 21.1702, 72.8311),
    c("VADODARA", "Vadodara", 22.3072, 73.1812),
    c("RAJKOT", "Rajkot", 22.3039, 70.8022),
    c("GANDHINAGAR", "Gandhinagar", 23.2232, 72.6499),
  ]},
  { state: "Haryana", cities: [
    c("GURUGRAM", "Gurugram", 28.4595, 77.0266),
    c("FARIDABAD", "Faridabad", 28.4089, 77.3178),
    c("CHANDIGARH_HR", "Chandigarh (Haryana)", 30.7333, 76.7794),
  ]},
  { state: "Himachal Pradesh", cities: [
    c("SHIMLA", "Shimla", 31.1048, 77.1734),
    c("MANALI", "Manali", 32.2396, 77.1887),
    c("DHARAMSHALA", "Dharamshala", 32.2190, 76.3234),
    c("KASOL", "Kasol", 32.0100, 77.3150),
  ]},
  { state: "Jammu & Kashmir", cities: [
    c("SRINAGAR", "Srinagar", 34.0837, 74.7973),
    c("JAMMU", "Jammu", 32.7266, 74.8570),
  ]},
  { state: "Jharkhand", cities: [
    c("RANCHI", "Ranchi", 23.3441, 85.3096),
    c("JAMSHEDPUR", "Jamshedpur", 22.8046, 86.2029),
  ]},
  { state: "Karnataka", cities: [
    c("BENGALURU", "Bengaluru", 12.9716, 77.5946),
    c("MYSURU", "Mysuru", 12.2958, 76.6394),
    c("MANGALURU", "Mangaluru", 12.9148, 74.8560),
    c("HUBLI", "Hubli", 15.3647, 75.1240),
    c("UDUPI", "Udupi", 13.3409, 74.7421),
  ]},
  { state: "Kerala", cities: [
    c("KOCHI", "Kochi", 9.9312, 76.2673),
    c("THIRUVANANTHAPURAM", "Thiruvananthapuram", 8.5241, 76.9366),
    c("KOZHIKODE", "Kozhikode", 11.2588, 75.7804),
    c("THRISSUR", "Thrissur", 10.5276, 76.2144),
    c("ALLEPPEY", "Alappuzha", 9.4981, 76.3388),
  ]},
  { state: "Ladakh", cities: [
    c("LEH", "Leh", 34.1526, 77.5770),
  ]},
  { state: "Madhya Pradesh", cities: [
    c("INDORE", "Indore", 22.7196, 75.8577),
    c("BHOPAL", "Bhopal", 23.2599, 77.4126),
    c("GWALIOR", "Gwalior", 26.2183, 78.1828),
    c("JABALPUR", "Jabalpur", 23.1815, 79.9864),
  ]},
  { state: "Maharashtra", cities: [
    c("MUMBAI", "Mumbai", 19.0760, 72.8777),
    c("NAVI MUMBAI", "Navi Mumbai", 19.0330, 73.0297),
    c("THANE", "Thane", 19.2183, 72.9781),
    c("PUNE", "Pune", 18.5204, 73.8567),
    c("NAGPUR", "Nagpur", 21.1458, 79.0882),
    c("NASHIK", "Nashik", 19.9975, 73.7898),
    c("AURANGABAD", "Chhatrapati Sambhaji Nagar", 19.8762, 75.3433),
    c("KOLHAPUR", "Kolhapur", 16.7050, 74.2433),
  ]},
  { state: "Manipur", cities: [
    c("IMPHAL", "Imphal", 24.8170, 93.9368),
  ]},
  { state: "Meghalaya", cities: [
    c("SHILLONG", "Shillong", 25.5788, 91.8933),
  ]},
  { state: "Mizoram", cities: [
    c("AIZAWL", "Aizawl", 23.7307, 92.7173),
  ]},
  { state: "Nagaland", cities: [
    c("KOHIMA", "Kohima", 25.6751, 94.1086),
    c("DIMAPUR", "Dimapur", 25.8628, 93.7537),
  ]},
  { state: "Odisha", cities: [
    c("BHUBANESWAR", "Bhubaneswar", 20.2961, 85.8245),
    c("CUTTACK", "Cuttack", 20.4625, 85.8830),
    c("PURI", "Puri", 19.8135, 85.8312),
    c("ROURKELA", "Rourkela", 22.2604, 84.8536),
  ]},
  { state: "Puducherry", cities: [
    c("PUDUCHERRY", "Puducherry", 11.9416, 79.8083),
  ]},
  { state: "Punjab", cities: [
    c("LUDHIANA", "Ludhiana", 30.9010, 75.8573),
    c("AMRITSAR", "Amritsar", 31.6340, 74.8723),
    c("JALANDHAR", "Jalandhar", 31.3260, 75.5762),
    c("MOHALI", "Mohali", 30.7046, 76.7179),
  ]},
  { state: "Rajasthan", cities: [
    c("JAIPUR", "Jaipur", 26.9124, 75.7873),
    c("UDAIPUR", "Udaipur", 24.5854, 73.7125),
    c("JODHPUR", "Jodhpur", 26.2389, 73.0243),
    c("PUSHKAR", "Pushkar", 26.4897, 74.5511),
    c("KOTA", "Kota", 25.2138, 75.8648),
  ]},
  { state: "Sikkim", cities: [
    c("GANGTOK", "Gangtok", 27.3389, 88.6065),
  ]},
  { state: "Tamil Nadu", cities: [
    c("CHENNAI", "Chennai", 13.0827, 80.2707),
    c("COIMBATORE", "Coimbatore", 11.0168, 76.9558),
    c("MADURAI", "Madurai", 9.9252, 78.1198),
    c("TIRUCHIRAPPALLI", "Tiruchirappalli", 10.7905, 78.7047),
    c("SALEM", "Salem", 11.6643, 78.1460),
    c("PONDICHERRY_TN", "Puducherry (TN)", 11.9416, 79.8083),
  ]},
  { state: "Telangana", cities: [
    c("HYDERABAD", "Hyderabad", 17.3850, 78.4867),
    c("WARANGAL", "Warangal", 17.9689, 79.5941),
    c("SECUNDERABAD", "Secunderabad", 17.4399, 78.4983),
  ]},
  { state: "Tripura", cities: [
    c("AGARTALA", "Agartala", 23.8315, 91.2868),
  ]},
  { state: "Uttar Pradesh", cities: [
    c("LUCKNOW", "Lucknow", 26.8467, 80.9462),
    c("KANPUR", "Kanpur", 26.4499, 80.3319),
    c("VARANASI", "Varanasi", 25.3176, 82.9739),
    c("AGRA", "Agra", 27.1767, 78.0081),
    c("NOIDA", "Noida", 28.5355, 77.3910),
    c("GREATER NOIDA", "Greater Noida", 28.4744, 77.5040),
    c("GHAZIABAD", "Ghaziabad", 28.6692, 77.4538),
    c("PRAYAGRAJ", "Prayagraj", 25.4358, 81.8463),
    c("MEERUT", "Meerut", 28.9845, 77.7064),
  ]},
  { state: "Uttarakhand", cities: [
    c("DEHRADUN", "Dehradun", 30.3165, 78.0322),
    c("HARIDWAR", "Haridwar", 29.9457, 78.1642),
    c("RISHIKESH", "Rishikesh", 30.0869, 78.2676),
    c("NAINITAL", "Nainital", 29.3803, 79.4636),
  ]},
  { state: "West Bengal", cities: [
    c("KOLKATA", "Kolkata", 22.5726, 88.3639),
    c("HOWRAH", "Howrah", 22.5958, 88.2636),
    c("SILIGURI", "Siliguri", 26.7271, 88.3953),
    c("DURGAPUR", "Durgapur", 23.5204, 87.3119),
    c("DARJEELING", "Darjeeling", 27.0410, 88.2663),
  ]},
  { state: "Andaman & Nicobar", cities: [
    c("PORT BLAIR", "Port Blair", 11.6234, 92.7265),
  ]},
  { state: "Arunachal Pradesh", cities: [
    c("ITANAGAR", "Itanagar", 27.0844, 93.6053),
    c("ZIRO", "Ziro", 27.5450, 93.8300),
  ]},
  { state: "Dadra & Nagar Haveli", cities: [
    c("SILVASSA", "Silvassa", 20.2734, 73.0160),
  ]},
  { state: "Daman & Diu", cities: [
    c("DAMAN", "Daman", 20.3974, 72.8328),
    c("DIU", "Diu", 20.7144, 70.9874),
  ]},
  { state: "Lakshadweep", cities: [
    c("KAVARATTI", "Kavaratti", 10.5669, 72.6420),
  ]},
];

/** Flat list of every listed city (for geo-nearest + display lookups). */
export const ALL_INDIAN_CITIES: CityDef[] =
  INDIAN_STATES_CITIES.flatMap((s) => s.cities);

const LABEL_BY_VALUE = new Map(ALL_INDIAN_CITIES.map((x) => [x.value, x.label]));

/** Canonical key for a typed/label city name ("pune" / "Pune" -> "PUNE"). */
export function normalizeCityKey(input: string): string {
  const t = input.trim().replace(/\s+/g, " ").toUpperCase();
  for (const [value, label] of LABEL_BY_VALUE) {
    if (label.toUpperCase() === t) return value;
  }
  return t;
}

/** Display label for any stored city key ("PUNE" -> "Pune", "NAVI MUMBAI" -> "Navi Mumbai"). */
export function cityLabel(value: string | null | undefined): string {
  if (!value) return "";
  const hit = LABEL_BY_VALUE.get(value);
  if (hit) return hit;
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/** Find the listed city closest to a geo point (haversine, km). */
export function nearestIndianCity(lat: number, lng: number): CityDef | null {
  let best: CityDef | null = null;
  let bestD = Infinity;
  for (const x of ALL_INDIAN_CITIES) {
    const dLat = (x.lat - lat) * Math.PI / 180;
    const dLng = (x.lng - lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(lat * Math.PI / 180) * Math.cos(x.lat * Math.PI / 180)
      * Math.sin(dLng / 2) ** 2;
    const d = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (d < bestD) { bestD = d; best = x; }
  }
  return best;
}
