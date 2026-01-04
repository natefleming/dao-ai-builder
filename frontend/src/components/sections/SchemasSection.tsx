import { useState, ChangeEvent } from 'react';
import { Plus, Trash2, Database, RefreshCw, Edit2, Key } from 'lucide-react';
import { useConfigStore } from '@/stores/configStore';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Card from '../ui/Card';
import Modal from '../ui/Modal';
import Badge from '../ui/Badge';
import { CatalogSelect, SchemaSelect } from '../ui/DatabricksSelect';
import { useCatalogs, useSchemas } from '@/hooks/useDatabricks';
import { isDatabricksConfigured } from '@/services/databricksNativeApi';
import { SchemaModel, VariableValue } from '@/types/dao-ai-types';
import { normalizeRefName, normalizeRefNameWhileTyping } from '@/utils/name-utils';
import { safeDelete } from '@/utils/safe-delete';
import { useYamlScrollStore } from '@/stores/yamlScrollStore';

type SchemaMode = 'select' | 'create';
type FieldSource = 'manual' | 'variable';

/**
 * Get the display string from a VariableValue.
 */
function getVariableDisplayValue(value: VariableValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    const obj = value as unknown as Record<string, unknown>;
    // Variable reference (starts with *)
    if ('_variableRef' in obj && typeof obj._variableRef === 'string') {
      return `*${obj._variableRef}`;
    }
    // Primitive variable
    if ('value' in obj) return String(obj.value);
    // Environment variable with default
    if ('env' in obj && obj.default_value !== undefined) return String(obj.default_value);
    // Return env var name for display
    if ('env' in obj) return `$${obj.env}`;
    // Secret
    if ('scope' in obj && 'secret' in obj) return `{{secrets/${obj.scope}/${obj.secret}}}`;
  }
  return '';
}

/**
 * Check if a value is a variable reference (string starting with *)
 */
function isVariableRef(value: VariableValue | undefined): boolean {
  if (typeof value === 'string' && value.startsWith('*')) return true;
  return false;
}

/**
 * Get variable reference name from a value
 */
function getVariableRefName(value: VariableValue | undefined): string {
  if (typeof value === 'string' && value.startsWith('*')) {
    return value.slice(1);
  }
  return '';
}

/**
 * Generate a normalized reference name from a schema path.
 */
function generateRefNameFromSchema(catalogName: string, schemaName: string): string {
  const combined = `${catalogName}_${schemaName}`;
  return normalizeRefName(combined);
}

export default function SchemasSection() {
  const { config, addSchema, removeSchema, updateSchema } = useConfigStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [mode, setMode] = useState<SchemaMode>('select');
  
  // Separate source selection for catalog and schema - allows mixing manual with variable
  const [catalogSource, setCatalogSource] = useState<FieldSource>('manual');
  const [schemaSource, setSchemaSource] = useState<FieldSource>('manual');
  
  const [formData, setFormData] = useState({
    name: '',
    catalogName: '',
    schemaName: '',
    catalogVariable: '',  // Variable reference for catalog
    schemaVariable: '',   // Variable reference for schema
  });

  const schemas = config.schemas || {};
  const variables = config.variables || {};
  const variableNames = Object.keys(variables);
  const configured = isDatabricksConfigured();
  
  // Fetch catalogs for the select mode
  const { data: catalogs, loading: catalogsLoading, refetch: refetchCatalogs } = useCatalogs();
  const { data: schemasList } = useSchemas(
    catalogSource === 'manual' ? (formData.catalogName || null) : null
  );

  const resetForm = () => {
    setFormData({ name: '', catalogName: '', schemaName: '', catalogVariable: '', schemaVariable: '' });
    setMode('select');
    setCatalogSource('manual');
    setSchemaSource('manual');
    setEditingKey(null);
  };

  const { scrollToAsset } = useYamlScrollStore();

  const handleEdit = (key: string, schema: SchemaModel) => {
    scrollToAsset(key);
    setEditingKey(key);
    
    // Determine if catalog/schema are variable references
    const catalogIsVar = isVariableRef(schema.catalog_name);
    const schemaIsVar = isVariableRef(schema.schema_name);
    
    setFormData({
      name: key,
      catalogName: catalogIsVar ? '' : getVariableDisplayValue(schema.catalog_name),
      schemaName: schemaIsVar ? '' : getVariableDisplayValue(schema.schema_name),
      catalogVariable: catalogIsVar ? getVariableRefName(schema.catalog_name) : '',
      schemaVariable: schemaIsVar ? getVariableRefName(schema.schema_name) : '',
    });
    
    setCatalogSource(catalogIsVar ? 'variable' : 'manual');
    setSchemaSource(schemaIsVar ? 'variable' : 'manual');
    
    // Determine mode based on catalog
    if (!catalogIsVar) {
      const catalogExists = catalogs?.some(c => c.name === getVariableDisplayValue(schema.catalog_name));
      setMode(catalogExists ? 'select' : 'create');
    } else {
      setMode('create'); // Variable mode uses create UI for the manual parts
    }
    
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Get the catalog value based on source
    // Trim variable names to handle any legacy variables with trailing spaces
    const catalogValue: VariableValue = catalogSource === 'variable' && formData.catalogVariable
      ? `*${formData.catalogVariable.trim()}`
      : formData.catalogName.trim();
    
    // Get the schema value based on source
    const schemaValue: VariableValue = schemaSource === 'variable' && formData.schemaVariable
      ? `*${formData.schemaVariable.trim()}`
      : formData.schemaName.trim();
    
    // Validate that we have the required values
    const hasCatalog = catalogSource === 'variable' ? !!formData.catalogVariable : !!formData.catalogName;
    const hasSchema = schemaSource === 'variable' ? !!formData.schemaVariable : !!formData.schemaName;
    
    if (formData.name && hasCatalog && hasSchema) {
      const schemaConfig: SchemaModel = {
        catalog_name: catalogValue,
        schema_name: schemaValue,
      };

      if (editingKey) {
        updateSchema(editingKey, schemaConfig);
      } else {
        addSchema(formData.name, schemaConfig);
      }
      resetForm();
      setIsModalOpen(false);
    }
  };

  const handleCatalogChange = (value: string) => {
    setFormData({ ...formData, catalogName: value, schemaName: '' });
  };

  // Check if the schema already exists in Databricks
  const schemaExistsInDatabricks = mode === 'create' && formData.catalogName && formData.schemaName && (
    schemasList?.some(s => s.name === formData.schemaName)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Schemas</h2>
          <p className="text-slate-400 mt-1">
            Define Unity Catalog schemas for your data and resources
          </p>
        </div>
        <Button onClick={() => { resetForm(); setIsModalOpen(true); }}>
          <Plus className="w-4 h-4" />
          Add Schema
        </Button>
      </div>

      {/* Schema List */}
      {Object.keys(schemas).length === 0 ? (
        <Card className="text-center py-12">
          <Database className="w-12 h-12 mx-auto text-slate-600 mb-4" />
          <h3 className="text-lg font-medium text-slate-300 mb-2">No schemas configured</h3>
          <p className="text-slate-500 mb-4">
            Schemas define where your data and resources are stored in Unity Catalog.
          </p>
          <Button onClick={() => { resetForm(); setIsModalOpen(true); }}>
            <Plus className="w-4 h-4" />
            Add Your First Schema
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {Object.entries(schemas).map(([key, schema]) => {
            // Get display values for catalog and schema
            const catalogDisplay = getVariableDisplayValue(schema.catalog_name);
            const schemaDisplay = getVariableDisplayValue(schema.schema_name);
            
            // Check if using variables
            const catalogIsVar = isVariableRef(schema.catalog_name);
            const schemaIsVar = isVariableRef(schema.schema_name);
            const usesVariables = catalogIsVar || schemaIsVar;
            
            // Check if this schema exists in Databricks (only if not using variables)
            const catalogExists = !catalogIsVar && catalogs?.some(c => c.name === catalogDisplay);
            
            return (
              <Card 
                key={key} 
                variant="interactive" 
                className="group cursor-pointer"
                onClick={() => handleEdit(key, schema)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${usesVariables ? 'bg-purple-500/20' : 'bg-blue-500/20'}`}>
                      {usesVariables ? (
                        <Key className="w-5 h-5 text-purple-400" />
                      ) : (
                        <Database className="w-5 h-5 text-blue-400" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-medium text-white">{key}</h3>
                      <p className="text-sm text-slate-400">
                        {catalogDisplay}.{schemaDisplay}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {usesVariables ? (
                      <Badge variant="info">Variable</Badge>
                    ) : catalogExists ? (
                      <Badge variant="success">Exists</Badge>
                    ) : (
                      <Badge variant="warning">New</Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(key, schema);
                      }}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        safeDelete('Schema', key, () => removeSchema(key));
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit Schema Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); resetForm(); }}
        title={editingKey ? 'Edit Schema' : 'Add Schema'}
        description="Configure a Unity Catalog schema reference"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Reference Name"
            placeholder="e.g., Retail Schema"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: normalizeRefNameWhileTyping(e.target.value) })}
            hint="Type naturally - spaces become underscores"
            required
            disabled={!!editingKey}
          />

          {/* Mode Toggle */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">Schema Source</label>
            <div className="inline-flex rounded-lg bg-slate-900/50 p-0.5 w-full">
              <button
                type="button"
                onClick={() => setMode('select')}
                className={`flex-1 px-3 py-1.5 text-xs rounded-md font-medium transition-all duration-150 flex items-center justify-center gap-1.5 ${
                  mode === 'select'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:text-slate-300 hover:border-slate-600'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                Use Existing
              </button>
              <button
                type="button"
                onClick={() => setMode('create')}
                className={`flex-1 px-3 py-1.5 text-xs rounded-md font-medium transition-all duration-150 flex items-center justify-center gap-1.5 ${
                  mode === 'create'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:text-slate-300 hover:border-slate-600'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                Create New
              </button>
            </div>
          </div>

          {mode === 'select' ? (
            <>
              {/* Select from existing catalogs/schemas */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Select from existing Unity Catalog</span>
                <button
                  type="button"
                  onClick={() => refetchCatalogs()}
                  className="text-xs text-slate-400 hover:text-white flex items-center space-x-1"
                  disabled={catalogsLoading}
                >
                  <RefreshCw className={`w-3 h-3 ${catalogsLoading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              {!configured && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-amber-400 text-sm">
                  Connect to Databricks first to browse existing catalogs and schemas.
                </div>
              )}

              {/* Catalog Name with Variable Option */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-300">
                    Catalog Name <span className="text-red-400">*</span>
                  </label>
                  <div className="inline-flex rounded-md bg-slate-900/50 p-0.5">
                    <button
                      type="button"
                      onClick={() => setCatalogSource('manual')}
                      className={`px-2 py-0.5 text-xs rounded font-medium transition-all ${
                        catalogSource === 'manual'
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                          : 'text-slate-400 hover:text-slate-300'
                      }`}
                    >
                      <Database className="w-3 h-3 inline mr-1" />
                      Select
                    </button>
                    <button
                      type="button"
                      onClick={() => setCatalogSource('variable')}
                      className={`px-2 py-0.5 text-xs rounded font-medium transition-all ${
                        catalogSource === 'variable'
                          ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40'
                          : 'text-slate-400 hover:text-slate-300'
                      }`}
                      disabled={variableNames.length === 0}
                      title={variableNames.length === 0 ? 'No variables configured' : 'Use a configured variable'}
                    >
                      <Key className="w-3 h-3 inline mr-1" />
                      Variable
                    </button>
                  </div>
                </div>
                {catalogSource === 'manual' ? (
                  <CatalogSelect
                    value={formData.catalogName}
                    onChange={handleCatalogChange}
                    hint="Select a Unity Catalog catalog"
                    required
                  />
                ) : (
                  <Select
                    value={formData.catalogVariable}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, catalogVariable: e.target.value })}
                    options={[
                      { value: '', label: 'Select a variable...' },
                      ...variableNames.map(v => ({ value: v, label: v })),
                    ]}
                    hint="Use a preconfigured variable for the catalog name"
                  />
                )}
              </div>

              {/* Schema Name with Variable Option */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-300">
                    Schema Name <span className="text-red-400">*</span>
                  </label>
                  <div className="inline-flex rounded-md bg-slate-900/50 p-0.5">
                    <button
                      type="button"
                      onClick={() => setSchemaSource('manual')}
                      className={`px-2 py-0.5 text-xs rounded font-medium transition-all ${
                        schemaSource === 'manual'
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                          : 'text-slate-400 hover:text-slate-300'
                      }`}
                    >
                      <Database className="w-3 h-3 inline mr-1" />
                      Select
                    </button>
                    <button
                      type="button"
                      onClick={() => setSchemaSource('variable')}
                      className={`px-2 py-0.5 text-xs rounded font-medium transition-all ${
                        schemaSource === 'variable'
                          ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40'
                          : 'text-slate-400 hover:text-slate-300'
                      }`}
                      disabled={variableNames.length === 0}
                      title={variableNames.length === 0 ? 'No variables configured' : 'Use a configured variable'}
                    >
                      <Key className="w-3 h-3 inline mr-1" />
                      Variable
                    </button>
                  </div>
                </div>
                {schemaSource === 'manual' ? (
                  <SchemaSelect
                    value={formData.schemaName}
                    onChange={(value) => setFormData({ 
                      ...formData, 
                      schemaName: value,
                      name: formData.name || generateRefNameFromSchema(formData.catalogName, value),
                    })}
                    catalog={catalogSource === 'manual' ? (formData.catalogName || null) : null}
                    hint={catalogSource === 'variable' ? 'Enter catalog first or use variable' : 'Select a schema within the catalog'}
                    required
                    disabled={catalogSource === 'variable'}
                  />
                ) : (
                  <Select
                    value={formData.schemaVariable}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, schemaVariable: e.target.value })}
                    options={[
                      { value: '', label: 'Select a variable...' },
                      ...variableNames.map(v => ({ value: v, label: v })),
                    ]}
                    hint="Use a preconfigured variable for the schema name"
                  />
                )}
              </div>
            </>
          ) : (
            <>
              {/* Create new catalog/schema */}
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <p className="text-sm text-green-400">
                  <strong>Note:</strong> When you deploy your dao-ai agent, it will create these Unity Catalog 
                  resources if they don't exist. Make sure you have the appropriate permissions.
                </p>
              </div>

              <div className="space-y-4">
                {/* Catalog Name with Variable Option */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-300">
                      Catalog Name <span className="text-red-400">*</span>
                    </label>
                    <div className="inline-flex rounded-md bg-slate-900/50 p-0.5">
                      <button
                        type="button"
                        onClick={() => setCatalogSource('manual')}
                        className={`px-2 py-0.5 text-xs rounded font-medium transition-all ${
                          catalogSource === 'manual'
                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                            : 'text-slate-400 hover:text-slate-300'
                        }`}
                      >
                        <Database className="w-3 h-3 inline mr-1" />
                        Manual
                      </button>
                      <button
                        type="button"
                        onClick={() => setCatalogSource('variable')}
                        className={`px-2 py-0.5 text-xs rounded font-medium transition-all ${
                          catalogSource === 'variable'
                            ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40'
                            : 'text-slate-400 hover:text-slate-300'
                        }`}
                        disabled={variableNames.length === 0}
                        title={variableNames.length === 0 ? 'No variables configured' : 'Use a configured variable'}
                      >
                        <Key className="w-3 h-3 inline mr-1" />
                        Variable
                      </button>
                    </div>
                  </div>
                  {catalogSource === 'manual' ? (
                    <>
                      <div className="flex space-x-2">
                        <input
                          type="text"
                          value={formData.catalogName}
                          onChange={(e) => setFormData({ ...formData, catalogName: e.target.value })}
                          placeholder="e.g., retail_catalog"
                          className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          required
                        />
                        {catalogs && catalogs.length > 0 && (
                          <select
                            value=""
                            onChange={(e) => {
                              if (e.target.value) {
                                setFormData({ ...formData, catalogName: e.target.value });
                              }
                            }}
                            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 cursor-pointer hover:border-slate-600"
                          >
                            <option value="">Pick existing...</option>
                            {catalogs.map(c => (
                              <option key={c.name} value={c.name}>{c.name}</option>
                            ))}
                          </select>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        Enter a new catalog name or pick an existing one
                      </p>
                    </>
                  ) : (
                    <Select
                      value={formData.catalogVariable}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, catalogVariable: e.target.value })}
                      options={[
                        { value: '', label: 'Select a variable...' },
                        ...variableNames.map(v => ({ value: v, label: v })),
                      ]}
                      hint="Use a preconfigured variable for the catalog name"
                    />
                  )}
                </div>

                {/* Schema Name with Variable Option */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-300">
                      Schema Name <span className="text-red-400">*</span>
                    </label>
                    <div className="inline-flex rounded-md bg-slate-900/50 p-0.5">
                      <button
                        type="button"
                        onClick={() => setSchemaSource('manual')}
                        className={`px-2 py-0.5 text-xs rounded font-medium transition-all ${
                          schemaSource === 'manual'
                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                            : 'text-slate-400 hover:text-slate-300'
                        }`}
                      >
                        <Database className="w-3 h-3 inline mr-1" />
                        Manual
                      </button>
                      <button
                        type="button"
                        onClick={() => setSchemaSource('variable')}
                        className={`px-2 py-0.5 text-xs rounded font-medium transition-all ${
                          schemaSource === 'variable'
                            ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40'
                            : 'text-slate-400 hover:text-slate-300'
                        }`}
                        disabled={variableNames.length === 0}
                        title={variableNames.length === 0 ? 'No variables configured' : 'Use a configured variable'}
                      >
                        <Key className="w-3 h-3 inline mr-1" />
                        Variable
                      </button>
                    </div>
                  </div>
                  {schemaSource === 'manual' ? (
                    <>
                      <div className="flex space-x-2">
                        <input
                          type="text"
                          value={formData.schemaName}
                          onChange={(e) => {
                            const newSchemaName = e.target.value;
                            setFormData({ 
                              ...formData, 
                              schemaName: newSchemaName,
                              name: formData.name || generateRefNameFromSchema(formData.catalogName, newSchemaName),
                            });
                          }}
                          placeholder="e.g., hardware_store"
                          className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          required
                        />
                        {catalogSource === 'manual' && formData.catalogName && schemasList && schemasList.length > 0 && (
                          <select
                            value=""
                            onChange={(e) => {
                              if (e.target.value) {
                                setFormData({ 
                                  ...formData, 
                                  schemaName: e.target.value,
                                  name: formData.name || generateRefNameFromSchema(formData.catalogName, e.target.value),
                                });
                              }
                            }}
                            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 cursor-pointer hover:border-slate-600"
                          >
                            <option value="">Pick existing...</option>
                            {schemasList.map(s => (
                              <option key={s.name} value={s.name}>{s.name}</option>
                            ))}
                          </select>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        Enter a new schema name or pick an existing one
                      </p>
                    </>
                  ) : (
                    <Select
                      value={formData.schemaVariable}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, schemaVariable: e.target.value })}
                      options={[
                        { value: '', label: 'Select a variable...' },
                        ...variableNames.map(v => ({ value: v, label: v })),
                      ]}
                      hint="Use a preconfigured variable for the schema name"
                    />
                  )}
                </div>

                {schemaExistsInDatabricks && (
                  <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <p className="text-sm text-blue-400">
                      ✓ This schema already exists in Unity Catalog
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Preview */}
          {((catalogSource === 'manual' && formData.catalogName) || (catalogSource === 'variable' && formData.catalogVariable)) &&
           ((schemaSource === 'manual' && formData.schemaName) || (schemaSource === 'variable' && formData.schemaVariable)) && (
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-400 mb-1">Full schema path:</p>
              <code className="text-sm text-white font-mono">
                {catalogSource === 'variable' ? (
                  <span className="text-purple-400">*{formData.catalogVariable}</span>
                ) : (
                  formData.catalogName
                )}
                .
                {schemaSource === 'variable' ? (
                  <span className="text-purple-400">*{formData.schemaVariable}</span>
                ) : (
                  formData.schemaName
                )}
              </code>
              {(catalogSource === 'variable' || schemaSource === 'variable') && (
                <p className="text-xs text-purple-400 mt-2">
                  <Key className="w-3 h-3 inline mr-1" />
                  Using variable reference(s) - resolved at runtime
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-4">
            <Button variant="secondary" type="button" onClick={() => { setIsModalOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button type="submit">
              {editingKey ? 'Save Changes' : 'Add Schema'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
