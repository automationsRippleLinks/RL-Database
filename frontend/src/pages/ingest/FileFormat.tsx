import { useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/Toast';
import { INGEST_SOURCE_LABELS } from '@/lib/enums';
import type { IngestSource } from '@/types/api';

interface Example {
  /** Fields a row cannot go in without. A row missing one of these is a mistake. */
  required: string[];
  /** Fields the backend reads when they are there. */
  optional: string[];
  row: Record<string, unknown>;
}

/** The profile fields every creator row has, whichever source it goes into. */
const CREATOR_FIELDS = {
  profile_link: 'https://www.instagram.com/example_handle/',
  name: 'Example Name',
  followers: 125000,
  avg_views: 40000,
  email: 'name@example.com',
  phone: '9876543210',
  gender: 'Female',
  city: 'Bengaluru',
  state: 'Karnataka',
  categories: 'Beauty & Makeup',
  languages: 'Hindi, English',
};
const CREATOR_OPTIONAL = ['followers', 'avg_views', 'email', 'phone', 'gender', 'city', 'state', 'categories', 'languages'];

/**
 * One example row per source. The field names are the ones the backend reads
 * (backend/app/services/ingest), so a file copied from here is accepted.
 */
const EXAMPLES: Record<IngestSource, Example> = {
  creator: {
    required: ['profile_link', 'name'],
    optional: [...CREATOR_OPTIONAL, 'bio', 'tags', 'brands'],
    row: { ...CREATOR_FIELDS, bio: 'Short bio', tags: 'tag one, tag two', brands: 'Example Brand' },
  },

  pitch_master: {
    required: ['pitch_code', 'brand_name', 'campaign_name', 'sales_lead'],
    optional: ['list_lead', 'year', 'spreadsheet_link', 'org_type', 'requirement', 'platforms'],
    row: {
      pitch_code: 'PITCH-001',
      brand_name: 'Example Brand',
      campaign_name: 'Example campaign',
      sales_lead: 'Example Person',
      list_lead: 'Example Person',
      year: 2026,
      spreadsheet_link: 'https://docs.google.com/spreadsheets/d/EXAMPLE_SPREADSHEET_ID/edit',
      org_type: 'Brand - Core',
      requirement: 'List',
      platforms: 'Instagram + YouTube',
    },
  },

  campaign_master: {
    required: ['campaign_code', 'year', 'month_name', 'brand_name', 'campaign_name', 'manager', 'start_date', 'expected_end_date'],
    optional: ['member_names', 'spreadsheet_link', 'report_link', 'end_date', 'report_completion_date', 'pitch_code', 'status', 'report_status'],
    row: {
      campaign_code: 'CAMP-001',
      year: 2026,
      month_name: 'november',
      brand_name: 'Example Brand',
      campaign_name: 'Example campaign',
      manager: 'Example Person',
      member_names: 'Person One, Person Two',
      start_date: '2026-11-01',
      expected_end_date: '2026-11-30',
      status: 'Live',
    },
  },
  
  pitch_creator: {
    required: ['source_file_id', 'profile_link', 'name'],
    optional: [...CREATOR_OPTIONAL, 'package_cost', 'final_cost'],
    row: {
      source_file_id: 'EXAMPLE_SPREADSHEET_ID',
      ...CREATOR_FIELDS,
      package_cost: 50000,
      final_cost: 60000,
    },
  },
  campaign_creator: {
    required: ['campaign_code', 'profile_link', 'name'],
    optional: [...CREATOR_OPTIONAL, 'package_cost', 'final_cost'],
    row: {
      campaign_code: 'CAMP-001',
      ...CREATOR_FIELDS,
      package_cost: 50000,
      final_cost: 60000,
    },
  },
};

/** Saves the example as a real file, so nobody has to copy it out of the page by hand. */
function downloadJson(fileName: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function FileFormat({ source }: { source: IngestSource }) {
  const { flash } = useToast();
  const [open, setOpen] = useState(false);
  const label = INGEST_SOURCE_LABELS[source];
  const example = EXAMPLES[source];
  const fileName = `${source}_example.json`;

  return (
    <div className="space-y-2">
      <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <FileText />
        {open ? 'Hide file format' : `See file format for ${label}`}
      </Button>

      {open && (
        <div className="space-y-2.5 rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">
            The file is a list of rows. Every row uses these exact field names. Copy the example and put your own values in.
          </p>
          <p className="text-[11px]">
            <span className="font-semibold">Required: </span>
            <span className="font-mono">{example.required.join(', ')}</span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            <span className="font-semibold">Optional: </span>
            <span className="font-mono">{example.optional.join(', ')}</span>
          </p>
          <pre className="max-h-64 overflow-auto rounded-md bg-muted/40 p-2.5 font-mono text-[11px] leading-relaxed scrollbar-thin">
            {JSON.stringify([example.row], null, 2)}
          </pre>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              downloadJson(fileName, [example.row]);
              flash('Example file downloaded');
            }}
          >
            <Download />
            Download this example
          </Button>
        </div>
      )}
    </div>
  );
}