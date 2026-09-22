import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  Cell,
} from 'recharts';
import {
  Calendar,
  Pill,
  Activity,
  FileCheck,
  Clock,
} from 'lucide-react';

const CATEGORY_MAP = {
  drug: {
    label: 'Medications',
    y: 3,
    color: '#2F6FED',
    bgColor: 'bg-[#EAF1FF]',
    borderColor: 'border-[#2F6FED]',
    textColor: 'text-[#2F6FED]',
    icon: Pill,
  },
  diagnosis: {
    label: 'Diagnoses',
    y: 2,
    color: '#F5A623',
    bgColor: 'bg-[#FEF6E9]',
    borderColor: 'border-[#F5A623]',
    textColor: 'text-[#F5A623]',
    icon: Activity,
  },
  measurement: {
    label: 'Measurements',
    y: 1,
    color: '#2FAE60',
    bgColor: 'bg-[#EAF7EE]',
    borderColor: 'border-[#2FAE60]',
    textColor: 'text-[#2FAE60]',
    icon: Activity,
  },
};

const Y_TICKS = [1, 2, 3];
const Y_TICK_LABELS = {
  1: 'Measurements',
  2: 'Diagnoses',
  3: 'Medications',
};

function CustomTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0].payload;
  const cat = CATEGORY_MAP[item.category] || CATEGORY_MAP.drug;

  return (
    <div className="rounded-2xl border border-[#E2E8F4] bg-white p-4 shadow-soft max-w-xs text-xs z-50">
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-[#E2E8F4]">
        <span
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: cat.color }}
        />
        <span className="font-bold text-[#1A2B4C] capitalize">{cat.label}</span>
        <span className="ml-auto text-[10px] text-[#6B7A99] font-mono">
          {item.dateLabel ? `${item.dateLabel} • ` : ''}{item.dateFormatted}
        </span>
      </div>

      <p className="font-bold text-[#1A2B4C] text-xs mb-1.5">{item.title}</p>

      {item.detail && (
        <div className="text-[#6B7A99] mb-1 flex items-center gap-1.5">
          <span>Details:</span>
          <span className="font-mono font-semibold text-[#1A2B4C]">{item.detail}</span>
        </div>
      )}

      {item.dosageNormalized && (
        <div className="text-[#6B7A99] mb-1">
          <span>Normalized: </span>
          <span className="text-[#2F6FED] font-mono font-bold">
            {item.dosageNormalized.display || `${item.dosageNormalized.value_mg} mg`}
          </span>
        </div>
      )}

      {item.sourceDoc && (
        <div className="mt-2 pt-1.5 border-t border-[#E2E8F4] text-[10px] text-[#6B7A99] truncate flex items-center gap-1">
          <FileCheck className="w-3 h-3 text-[#6B7A99]" />
          <span>Source: {item.sourceDoc}</span>
        </div>
      )}
    </div>
  );
}

export default function MedicalTimeline({ documents = [] }) {
  const [selectedCategory, setSelectedCategory] = useState('all');

  const timelineData = useMemo(() => {
    const points = [];

    documents.forEach((doc) => {
      const extracted = doc.extracted || doc.extracted_json || {};
      const filename = doc.filename || 'Prescription/Report';
      const rawDates = extracted.dates || [];
      const parsedDates = [];

      rawDates.forEach((d) => {
        let ms = d.timestamp_ms;
        let str = d.value;
        if (!ms && str) {
          const p = new Date(str).getTime();
          if (!isNaN(p)) ms = p;
        }
        if (ms) {
          parsedDates.push({
            label: d.label || 'Date',
            value: str || new Date(ms).toLocaleDateString(),
            ms,
          });
        }
      });

      const fallbackMs = doc.created_at ? new Date(doc.created_at).getTime() : Date.now();
      const fallbackDateStr = doc.created_at ? new Date(doc.created_at).toLocaleDateString() : 'Recent';

      const getEventDate = (index, total, preferredType = 'middle') => {
        if (parsedDates.length === 0) {
          return { ms: fallbackMs, str: fallbackDateStr, label: 'Document Date' };
        }
        if (parsedDates.length === 1) {
          return { ms: parsedDates[0].ms, str: parsedDates[0].value, label: parsedDates[0].label };
        }
        if (preferredType === 'earliest') {
          return { ms: parsedDates[0].ms, str: parsedDates[0].value, label: parsedDates[0].label };
        }
        if (preferredType === 'latest') {
          const last = parsedDates[parsedDates.length - 1];
          return { ms: last.ms, str: last.value, label: last.label };
        }
        const dateIdx = index % parsedDates.length;
        return { ms: parsedDates[dateIdx].ms, str: parsedDates[dateIdx].value, label: parsedDates[dateIdx].label };
      };

      (extracted.diagnoses || []).forEach((diag, idx) => {
        const title = typeof diag === 'string' ? diag : diag.name || diag.diagnosis || 'Diagnosis';
        const dateInfo = getEventDate(idx, (extracted.diagnoses || []).length, 'earliest');
        points.push({
          id: `diag-${doc.id || doc.document_id || 0}-${idx}`,
          category: 'diagnosis',
          y: CATEGORY_MAP.diagnosis.y,
          x: dateInfo.ms,
          dateMs: dateInfo.ms,
          dateFormatted: dateInfo.str,
          dateLabel: dateInfo.label,
          title,
          detail: typeof diag === 'object' ? diag.status || null : null,
          sourceDoc: filename,
        });
      });

      (extracted.drug_names || []).forEach((drug, idx) => {
        const dateInfo = getEventDate(idx, (extracted.drug_names || []).length, 'middle');
        points.push({
          id: `drug-${doc.id || doc.document_id || 0}-${idx}`,
          category: 'drug',
          y: CATEGORY_MAP.drug.y,
          x: dateInfo.ms,
          dateMs: dateInfo.ms,
          dateFormatted: dateInfo.str,
          dateLabel: dateInfo.label,
          title: drug.name,
          detail: drug.dosage
            ? `${drug.dosage}${drug.frequency ? ` (${drug.frequency})` : ''}`
            : drug.frequency || null,
          dosageNormalized: drug.dosage_normalized,
          sourceDoc: filename,
        });
      });

      (extracted.measurements || []).forEach((m, idx) => {
        const title = m.type || 'Measurement';
        const dateInfo = getEventDate(idx, (extracted.measurements || []).length, 'latest');
        const detail = m.raw || (m.unit ? `${m.value} ${m.unit}` : null);
        points.push({
          id: `meas-${doc.id || doc.document_id || 0}-${idx}`,
          category: 'measurement',
          y: CATEGORY_MAP.measurement.y,
          x: dateInfo.ms,
          dateMs: dateInfo.ms,
          dateFormatted: dateInfo.str,
          dateLabel: dateInfo.label,
          title,
          detail,
          sourceDoc: filename,
        });
      });
    });

    return points.sort((a, b) => a.x - b.x);
  }, [documents]);

  const filteredPoints = useMemo(() => {
    if (selectedCategory === 'all') return timelineData;
    return timelineData.filter((p) => p.category === selectedCategory);
  }, [timelineData, selectedCategory]);

  if (!timelineData.length) {
    return (
      <div className="rounded-2xl border border-dashed border-[#E2E8F4] bg-[#F6F9FF] p-8 text-center">
        <Calendar className="w-8 h-8 text-[#6B7A99] mx-auto mb-2" />
        <h4 className="text-sm font-bold text-[#1A2B4C]">No timeline events extracted yet</h4>
        <p className="text-xs text-[#6B7A99] mt-1 max-w-sm mx-auto">
          Upload prescriptions or medical test reports above to extract clinical dates, medications, and diagnoses.
        </p>
      </div>
    );
  }

  const minX = Math.min(...timelineData.map((d) => d.x));
  const maxX = Math.max(...timelineData.map((d) => d.x));
  const xSpan = Math.max(maxX - minX, 86400000 * 30);
  const xDomain = [minX - xSpan * 0.08, maxX + xSpan * 0.08];

  return (
    <div className="rounded-2xl border border-[#E2E8F4] bg-white p-6 shadow-soft space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E2E8F4]">
        <div>
          <h3 className="text-base font-bold text-[#1A2B4C] flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#2F6FED]" />
            <span>Extracted Medical Timeline</span>
          </h3>
          <p className="text-xs text-[#6B7A99] mt-0.5">
            Plotting {timelineData.length} clinical events across extracted prescription and report dates.
          </p>
        </div>

        <div className="flex items-center gap-1.5 text-xs flex-wrap">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1 rounded-full font-semibold transition ${
              selectedCategory === 'all'
                ? 'bg-[#2F6FED] text-white shadow-sm'
                : 'text-[#6B7A99] hover:text-[#1A2B4C] hover:bg-[#EAF1FF]'
            }`}
          >
            All ({timelineData.length})
          </button>
          {Object.entries(CATEGORY_MAP).map(([key, cat]) => {
            const count = timelineData.filter((p) => p.category === key).length;
            const Icon = cat.icon;
            return (
              <button
                key={key}
                onClick={() => setSelectedCategory(key)}
                className={`px-3 py-1 rounded-full font-semibold transition flex items-center gap-1.5 ${
                  selectedCategory === key
                    ? `${cat.bgColor} ${cat.textColor} shadow-sm`
                    : 'text-[#6B7A99] hover:text-[#1A2B4C] hover:bg-[#EAF1FF]'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{cat.label}</span>
                <span className="text-[10px] opacity-70">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 15, right: 20, bottom: 15, left: 10 }}>
            <XAxis
              dataKey="x"
              type="number"
              domain={xDomain}
              scale="time"
              tickFormatter={(unixTime) => {
                const date = new Date(unixTime);
                return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
              }}
              stroke="#E2E8F4"
              tick={{ fill: '#6B7A99', fontSize: 11 }}
              tickLine={{ stroke: '#E2E8F4' }}
            />
            <YAxis
              dataKey="y"
              type="number"
              domain={[0.5, 3.5]}
              ticks={Y_TICKS}
              tickFormatter={(val) => Y_TICK_LABELS[val] || ''}
              stroke="#E2E8F4"
              tick={{ fill: '#1A2B4C', fontSize: 12, fontWeight: 600 }}
              tickLine={false}
              width={100}
            />
            <ZAxis range={[120, 180]} />
            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#2F6FED' }} />

            <Scatter data={filteredPoints} shape="circle">
              {filteredPoints.map((entry) => {
                const color = CATEGORY_MAP[entry.category]?.color || '#2F6FED';
                return (
                  <Cell
                    key={entry.id}
                    fill={color}
                    stroke="#FFFFFF"
                    strokeWidth={2}
                    className="hover:scale-125 transition-transform cursor-pointer"
                  />
                );
              })}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="pt-3 border-t border-[#E2E8F4]">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-[#1A2B4C] flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#2F6FED]" />
            <span>Chronological events</span>
          </span>
          <span className="text-[11px] text-[#6B7A99]">
            {filteredPoints.length} items plotted
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-52 overflow-y-auto pr-1">
          {filteredPoints.map((pt) => {
            const cat = CATEGORY_MAP[pt.category] || CATEGORY_MAP.drug;
            const Icon = cat.icon;
            return (
              <div
                key={pt.id}
                className="p-3 rounded-xl border border-[#E2E8F4] bg-[#F6F9FF] flex items-start gap-3 text-xs"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: `${cat.color}15`, color: cat.color }}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold text-[#1A2B4C] truncate">{pt.title}</span>
                    <span className="text-[10px] text-[#6B7A99] font-mono">
                      {pt.dateFormatted}
                    </span>
                  </div>
                  {pt.detail && (
                    <p className="text-[11px] text-[#6B7A99] truncate mt-0.5">{pt.detail}</p>
                  )}
                  {pt.dosageNormalized && (
                    <p className="text-[10px] text-[#2F6FED] font-mono mt-0.5 truncate font-semibold">
                      Norm: {pt.dosageNormalized.display || `${pt.dosageNormalized.value_mg} mg`}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
