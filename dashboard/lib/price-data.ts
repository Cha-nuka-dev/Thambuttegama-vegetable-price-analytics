export type CropId = "tomato" | "brinjal" | "green-chilli" | "okra" | "bitter-gourd" | "spiny-gourd" | "capsicum" | "beans" | "local-big-onion" | "cauliflower";
export type PriceType = "wholesale" | "retail" | "farmgate";
export type SourceKind = "official" | "facebook" | "manual" | "ocr" | "demo";

export type Observation = {
  id: string;
  date: string;
  crop: CropId;
  variety: string;
  minPrice: number;
  maxPrice: number;
  priceType: PriceType;
  sourceKind: SourceKind;
  sourceUrl: string;
  enteredAt?: string;
};

export const crops: {id:CropId; si:string; en:string; color:string}[] = [
  {id:"tomato",si:"තක්කාලි",en:"Tomato",color:"#df7250"},
  {id:"brinjal",si:"වම්බටු",en:"Brinjal",color:"#a779bb"},
  {id:"green-chilli",si:"අමු මිරිස්",en:"Green chilli",color:"#67a95d"},
  {id:"okra",si:"බණ්ඩක්කා",en:"Okra",color:"#91ae58"},
  {id:"bitter-gourd",si:"කරවිල",en:"Bitter gourd",color:"#78a9a4"},
  {id:"spiny-gourd",si:"තුඹ කරවිල",en:"Thumba karawila (spiny gourd)",color:"#d68f7a"},
  {id:"capsicum",si:"මාළු මිරිස්",en:"Capsicum",color:"#dfa958"},
  {id:"beans",si:"බෝංචි",en:"Beans",color:"#669e7a"},
  {id:"local-big-onion",si:"දේශීය ලොකු ළූණු",en:"Local big onion",color:"#bc955e"},
  {id:"cauliflower",si:"මල් ගෝවා",en:"Cauliflower",color:"#b4bca2"},
];

export const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function official(crop: CropId, minPrice: number, maxPrice: number, variety: string): Observation {
  return {id:`2025-04-23|${crop}|${variety.toLowerCase()}|wholesale`, date:"2025-04-23",crop,variety,minPrice,maxPrice,
    priceType:"wholesale",sourceKind:"official",sourceUrl:"https://app.thambuttegamadec.lk/public/"};
}

// Verifiable reference observations. These are isolated trading days, NOT full monthly averages.
// The 2025-04-23 values came from the Centre's public price page (its displayed snapshot date).
// The Facebook bean examples came from the posted 04.06.2025 and 23.10.2026 lists.
export const referenceObservations: Observation[] = [
  official("tomato",400,500,"Rajarata"),
  official("brinjal",160,180,"Puttalam"),
  official("green-chilli",200,250,"MI2"),
  official("okra",150,200,"Rajarata"),
  official("bitter-gourd",210,250,"Rajarata"),
  official("capsicum",500,600,"Rajarata"),
  official("beans",400,550,"Nuwara Eliya"),
  {id:"2025-06-04|beans|nuwara eliya|wholesale", date:"2025-06-04",crop:"beans",variety:"Nuwara Eliya",minPrice:350,maxPrice:450,priceType:"wholesale",sourceKind:"facebook",sourceUrl:"https://www.facebook.com/thambuttegamaeconomiccenter/posts/dedicated-economic-center-thambuttegama-price-list-on-04062025/1651853882370245/"},
  {id:"2026-10-23|beans|nuwara eliya|wholesale", date:"2026-10-23",crop:"beans",variety:"Nuwara Eliya",minPrice:450,maxPrice:500,priceType:"wholesale",sourceKind:"facebook",sourceUrl:"https://www.facebook.com/photo/?fbid=2099428950946067&set=a.1297137877841849"},
];

export function midpoint(item: Observation) { return (item.minPrice + item.maxPrice) / 2; }
export function priceLabel(value: number) { return `Rs. ${Math.round(value).toLocaleString("en-LK")}`; }
