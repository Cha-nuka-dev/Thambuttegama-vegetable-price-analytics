import { Observation, midpoint } from "./price-data";

/** An exploratory wholesale-price scenario, not a confidence interval. */
export type SeasonalForecast = {
  price: number;
  low: number;
  high: number;
  years: number;
  days: number;
  monthsAhead: number;
  basisYears: number[];
  limited: boolean;
};

/**
 * Uses historical readings for the matching calendar month only.
 * 1. Average duplicate readings within a trading day so that each date counts once.
 * 2. Calculate one monthly average per year (at least three sampled days).
 * 3. Combine years with modest weights favoring recency and data coverage.
 * 4. Widen the illustrative range with inter-year variation and horizon.
 *
 * This is deliberately not an ML model or a validated predictive interval.
 */
export function estimateSeasonalPrice(records: Observation[], targetMonth: string): SeasonalForecast | null {
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(targetMonth))return null;
  const targetYear=Number(targetMonth.slice(0,4));
  const targetMonthNumber=Number(targetMonth.slice(5,7));
  const targetStart=targetMonth+"-01";
  const days=new Map<string,number[]>();
  for(const row of records){
    if(row.date>=targetStart || Number(row.date.slice(5,7))!==targetMonthNumber)continue;
    if(!Number.isFinite(row.minPrice)||!Number.isFinite(row.maxPrice)||row.minPrice<=0||row.maxPrice<row.minPrice)continue;
    const values=days.get(row.date)||[];
    values.push(midpoint(row));days.set(row.date,values);
  }
  const perYear=new Map<number,number[]>();
  for(const [date,values] of days){
    const year=Number(date.slice(0,4));
    const readings=perYear.get(year)||[];
    readings.push(values.reduce((a,b)=>a+b,0)/values.length);
    perYear.set(year,readings);
  }
  const history=[...perYear].filter(([,values])=>values.length>=3).map(([year,values])=>({
    year,days:values.length,average:values.reduce((a,b)=>a+b,0)/values.length,
  })).sort((a,b)=>a.year-b.year);
  if(history.length===0)return null;
  const totalDays=history.reduce((n,item)=>n+item.days,0);
  if(totalDays<8)return null;
  const latestYear=history[history.length-1].year;
  const weighted=history.map(item=>({...item,weight:Math.pow(0.82,latestYear-item.year)*Math.sqrt(Math.min(item.days,20))}));
  const totalWeight=weighted.reduce((n,item)=>n+item.weight,0);
  const estimated=weighted.reduce((n,item)=>n+item.average*item.weight,0)/totalWeight;
  const variance=weighted.reduce((n,item)=>n+item.weight*(item.average-estimated)**2,0)/totalWeight;
  const latestDate=records.reduce((last,item)=>item.date>last?item.date:last,"");
  const lastRecordedMonth=latestDate?Number(latestDate.slice(0,4))*12+Number(latestDate.slice(5,7)):latestYear*12+targetMonthNumber;
  const monthsAhead=Math.max(0,targetYear*12+targetMonthNumber-lastRecordedMonth);
  // This range is a scenario band, not a statistically calibrated probability.
  const yearVariation=estimated>0?Math.sqrt(variance)/estimated:0;
  const width=Math.min(0.80,Math.max(history.length===1?0.40:0.25,yearVariation*1.6)
    +Math.max(0,monthsAhead-3)*0.012);
  return {
    price:estimated,low:Math.max(0,estimated*(1-width)),high:estimated*(1+width),
    years:history.length,days:totalDays,monthsAhead,basisYears:history.map(item=>item.year),
    limited:history.length<3||totalDays<20,
  };
}
