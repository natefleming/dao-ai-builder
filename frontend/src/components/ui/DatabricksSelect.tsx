/**
 * Databricks-aware select components that fetch data from the workspace.
 * Uses native browser fetch to call Databricks REST APIs directly.
 */
import { useEffect, ChangeEvent } from 'react';
import Select from './Select';
import {
  useCatalogs,
  useSchemas,
  useServingEndpoints,
  useSQLWarehouses,
  useGenieSpaces,
  useApps,
  useVectorSearchEndpoints,
  useFunctions,
  useDatabases,
  useUCConnections,
} from '../../hooks/useDatabricks';
import { isDatabricksConfigured } from '../../services/databricksNativeApi';

interface DatabricksSelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Catalog selector that fetches from Databricks.
 */
export function CatalogSelect({
  label = 'Catalog',
  value,
  onChange,
  hint,
  required,
  disabled,
  placeholder = 'Select a catalog',
}: DatabricksSelectProps) {
  const { data: catalogs, loading, error } = useCatalogs();
  const configured = isDatabricksConfigured();

  const options = [
    { value: '', label: placeholder },
    ...(catalogs || []).map((c) => ({
      value: c.name,
      label: c.name,
    })),
  ];

  return (
    <Select
      label={label}
      value={value}
      onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
      options={options}
      hint={
        !configured
          ? 'Connect to Databricks first'
          : loading
          ? 'Loading catalogs...'
          : error
          ? 'Failed to load catalogs'
          : hint
      }
      required={required}
      disabled={disabled || loading || !configured}
    />
  );
}

/**
 * Schema selector that fetches schemas for a given catalog.
 */
export function SchemaSelect({
  label = 'Schema',
  value,
  onChange,
  catalog,
  hint,
  required,
  disabled,
  placeholder = 'Select a schema',
}: DatabricksSelectProps & { catalog: string | null }) {
  const { data: schemas, loading, error } = useSchemas(catalog);
  const configured = isDatabricksConfigured();

  // Reset value when catalog changes
  useEffect(() => {
    if (value && schemas && !schemas.find((s) => s.name === value)) {
      onChange('');
    }
  }, [catalog, schemas, value, onChange]);

  const options = [
    { value: '', label: placeholder },
    ...(schemas || []).map((s) => ({
      value: s.name,
      label: s.name,
    })),
  ];

  return (
    <Select
      label={label}
      value={value}
      onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
      options={options}
      hint={
        !configured
          ? 'Connect to Databricks first'
          : !catalog
          ? 'Select a catalog first'
          : loading
          ? 'Loading schemas...'
          : error
          ? 'Failed to load schemas'
          : hint
      }
      required={required}
      disabled={disabled || loading || !catalog || !configured}
    />
  );
}

/**
 * Combined catalog and schema selector.
 */
export function CatalogSchemaSelect({
  catalogValue,
  schemaValue,
  onCatalogChange,
  onSchemaChange,
  catalogLabel = 'Catalog',
  schemaLabel = 'Schema',
  required,
  disabled,
}: {
  catalogValue: string;
  schemaValue: string;
  onCatalogChange: (value: string) => void;
  onSchemaChange: (value: string) => void;
  catalogLabel?: string;
  schemaLabel?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <CatalogSelect
        label={catalogLabel}
        value={catalogValue}
        onChange={onCatalogChange}
        required={required}
        disabled={disabled}
      />
      <SchemaSelect
        label={schemaLabel}
        value={schemaValue}
        onChange={onSchemaChange}
        catalog={catalogValue || null}
        required={required}
        disabled={disabled}
      />
    </div>
  );
}

/**
 * Serving endpoint selector (for LLMs).
 */
export function ServingEndpointSelect({
  label = 'Model Endpoint',
  value,
  onChange,
  hint,
  required,
  disabled,
  placeholder = 'Select an endpoint',
}: DatabricksSelectProps) {
  const { data: endpoints, loading, error } = useServingEndpoints();
  const configured = isDatabricksConfigured();

  const options = [
    { value: '', label: placeholder },
    ...(endpoints || []).map((e) => ({
      value: e.name,
      label: `${e.name}${e.state?.ready ? ` (${e.state.ready})` : ''}`,
    })),
  ];

  return (
    <Select
      label={label}
      value={value}
      onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
      options={options}
      hint={
        !configured
          ? 'Connect to Databricks first'
          : loading
          ? 'Loading endpoints...'
          : error
          ? 'Failed to load endpoints'
          : hint
      }
      required={required}
      disabled={disabled || loading || !configured}
    />
  );
}

/**
 * SQL Warehouse selector.
 */
export function SQLWarehouseSelect({
  label = 'SQL Warehouse',
  value,
  onChange,
  hint,
  required,
  disabled,
  placeholder = 'Select a warehouse',
}: DatabricksSelectProps) {
  const { data: warehouses, loading, error } = useSQLWarehouses();
  const configured = isDatabricksConfigured();

  const options = [
    { value: '', label: placeholder },
    ...(warehouses || []).map((w) => ({
      value: w.id,
      label: `${w.name}${w.state ? ` (${w.state})` : ''}`,
    })),
  ];

  return (
    <Select
      label={label}
      value={value}
      onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
      options={options}
      hint={
        !configured
          ? 'Connect to Databricks first'
          : loading
          ? 'Loading warehouses...'
          : error
          ? 'Failed to load warehouses'
          : hint
      }
      required={required}
      disabled={disabled || loading || !configured}
    />
  );
}

/**
 * Genie Space selector.
 * Shows title and description preview. Sorted alphabetically by title.
 */
export function GenieSpaceSelect({
  label = 'Genie Space',
  value,
  onChange,
  hint,
  required,
  disabled,
  placeholder = 'Select a Genie space',
}: DatabricksSelectProps) {
  const { data: spaces, loading, error } = useGenieSpaces();
  const configured = isDatabricksConfigured();

  // Build label with title and description preview
  const buildLabel = (s: { title: string; description?: string }) => {
    let label = s.title;
    if (s.description) {
      // Truncate description to 50 chars
      const desc = s.description.length > 50 ? s.description.substring(0, 50) + '...' : s.description;
      label += ` - ${desc}`;
    }
    return label;
  };

  const options = [
    { value: '', label: placeholder },
    ...(spaces || []).map((s) => ({
      value: s.space_id,
      label: buildLabel(s),
    })),
  ];

  return (
    <Select
      label={label}
      value={value}
      onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
      options={options}
      hint={
        !configured
          ? 'Connect to Databricks first'
          : loading
          ? 'Loading Genie spaces...'
          : error
          ? 'Failed to load Genie spaces'
          : hint
      }
      required={required}
      disabled={disabled || loading || !configured}
    />
  );
}

/**
 * Lakebase Database selector.
 */
export function DatabaseSelect({
  label = 'Database',
  value,
  onChange,
  hint,
  required,
  disabled,
  placeholder = 'Select a database',
}: DatabricksSelectProps) {
  const { data: databases, loading, error } = useDatabases();
  const configured = isDatabricksConfigured();

  const options = [
    { value: '', label: placeholder },
    ...(databases || []).map((db) => ({
      value: db.name,
      label: `${db.name}${db.state ? ` (${db.state})` : ''}`,
    })),
  ];

  return (
    <Select
      label={label}
      value={value}
      onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
      options={options}
      hint={
        !configured
          ? 'Connect to Databricks first'
          : loading
          ? 'Loading databases...'
          : error
          ? 'Failed to load databases'
          : databases?.length === 0
          ? 'No Lakebase databases found'
          : hint
      }
      required={required}
      disabled={disabled || loading || !configured}
    />
  );
}

/**
 * Databricks App selector.
 * Lists all apps in the workspace and allows selection by name.
 */
export function DatabricksAppSelect({
  label = 'Databricks App',
  value,
  onChange,
  hint,
  required,
  disabled,
  placeholder = 'Select an app',
}: DatabricksSelectProps) {
  const { data: apps, loading, error } = useApps();
  const configured = isDatabricksConfigured();

  const options = [
    { value: '', label: placeholder },
    ...(apps || []).map((app) => ({
      value: app.name,
      label: `${app.name}${app.app_status?.state ? ` (${app.app_status.state})` : ''}`,
    })),
  ];

  return (
    <Select
      label={label}
      value={value}
      onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
      options={options}
      hint={
        !configured
          ? 'Connect to Databricks first'
          : loading
          ? 'Loading apps...'
          : error
          ? 'Failed to load apps'
          : hint
      }
      required={required}
      disabled={disabled || loading || !configured}
    />
  );
}

/**
 * Vector Search Endpoint selector.
 */
export function VectorSearchEndpointSelect({
  label = 'Vector Search Endpoint',
  value,
  onChange,
  hint,
  required,
  disabled,
  placeholder = 'Select an endpoint',
}: DatabricksSelectProps) {
  const { data: endpoints, loading, error } = useVectorSearchEndpoints();
  const configured = isDatabricksConfigured();

  const options = [
    { value: '', label: placeholder },
    ...(endpoints || []).map((e) => ({
      value: e.name,
      label: `${e.name}${e.endpoint_status?.state ? ` (${e.endpoint_status.state})` : ''}`,
    })),
  ];

  return (
    <Select
      label={label}
      value={value}
      onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
      options={options}
      hint={
        !configured
          ? 'Connect to Databricks first'
          : loading
          ? 'Loading endpoints...'
          : error
          ? 'Failed to load endpoints'
          : hint
      }
      required={required}
      disabled={disabled || loading || !configured}
    />
  );
}

/**
 * Unity Catalog Function selector.
 */
export function UCFunctionSelect({
  label = 'Function',
  value,
  onChange,
  catalog,
  schema,
  hint,
  required,
  disabled,
  placeholder = 'Select a function',
}: DatabricksSelectProps & { catalog: string | null; schema: string | null }) {
  const { data: functions, loading, error } = useFunctions(catalog, schema);
  const configured = isDatabricksConfigured();

  const options = [
    { value: '', label: placeholder },
    ...(functions || []).map((f) => ({
      value: f.full_name,
      label: f.name,
    })),
  ];

  return (
    <Select
      label={label}
      value={value}
      onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
      options={options}
      hint={
        !configured
          ? 'Connect to Databricks first'
          : !catalog || !schema
          ? 'Select catalog and schema first'
          : loading
          ? 'Loading functions...'
          : error
          ? 'Failed to load functions'
          : hint
      }
      required={required}
      disabled={disabled || loading || !catalog || !schema || !configured}
    />
  );
}

/**
 * Unity Catalog Connection selector.
 */
export function UCConnectionSelect({
  label = 'UC Connection',
  value,
  onChange,
  hint,
  required,
  disabled,
  placeholder = 'Select a connection',
}: DatabricksSelectProps) {
  const { data: connections, loading, error } = useUCConnections();
  const configured = isDatabricksConfigured();

  const options = [
    { value: '', label: placeholder },
    ...(connections || []).map((c) => ({
      value: c.name,
      label: `${c.name}${c.connection_type ? ` (${c.connection_type})` : ''}`,
    })),
  ];

  return (
    <Select
      label={label}
      value={value}
      onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
      options={options}
      hint={
        !configured
          ? 'Connect to Databricks first'
          : loading
          ? 'Loading connections...'
          : error
          ? 'Failed to load connections'
          : connections?.length === 0
          ? 'No UC connections found'
          : hint
      }
      required={required}
      disabled={disabled || loading || !configured}
    />
  );
}
