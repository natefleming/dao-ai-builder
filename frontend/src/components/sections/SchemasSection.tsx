import { useState } from 'react';
import { Plus, Trash2, Database, RefreshCw, Edit2 } from 'lucide-react';
import { useConfigStore } from '@/stores/configStore';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Card from '../ui/Card';
import Modal from '../ui/Modal';
import Badge from '../ui/Badge';
import { CatalogSelect, SchemaSelect } from '../ui/DatabricksSelect';
import { useCatalogs, useSchemas } from '@/hooks/useDatabricks';
import { isDatabricksConfigured } from '@/services/databricksNativeApi';
import { SchemaModel } from '@/types/dao-ai-types';

type SchemaMode = 'select' | 'create';

/**
 * Generate a normalized reference name from a schema path.
 * - Converts to lowercase
 * - Replaces consecutive whitespace/special chars with single underscore
 * - Removes leading/trailing underscores
 */
function generateRefName(catalogName: string, schemaName: string): string {
  const combined = `${catalogName}_${schemaName}`;
  return combined
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export default function SchemasSection() {
  const { config, addSchema, removeSchema, updateSchema } = useConfigStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [mode, setMode] = useState<SchemaMode>('select');
  const [formData, setFormData] = useState({
    name: '',
    catalogName: '',
    schemaName: '',
  });

  const schemas = config.schemas || {};
  const configured = isDatabricksConfigured();
  
  // Fetch catalogs for the select mode
  const { data: catalogs, loading: catalogsLoading, refetch: refetchCatalogs } = useCatalogs();
  const { data: schemasList } = useSchemas(formData.catalogName || null);

  const resetForm = () => {
    setFormData({ name: '', catalogName: '', schemaName: '' });
    setMode('select');
    setEditingKey(null);
  };

  const handleEdit = (key: string, schema: SchemaModel) => {
    setEditingKey(key);
    setFormData({
      name: key,
      catalogName: schema.catalog_name,
      schemaName: schema.schema_name,
    });
    // Check if catalog exists in the list
    const catalogExists = catalogs?.some(c => c.name === schema.catalog_name);
    
    // If catalog exists, use select mode, otherwise create mode
    if (catalogExists) {
      setMode('select');
    } else {
      setMode('create');
    }
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name && formData.catalogName && formData.schemaName) {
      const schemaConfig: SchemaModel = {
        catalog_name: formData.catalogName,
        schema_name: formData.schemaName,
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
            // Check if this schema exists in Databricks
            const catalogExists = catalogs?.some(c => c.name === schema.catalog_name);
            
            return (
              <Card 
                key={key} 
                variant="interactive" 
                className="group cursor-pointer"
                onClick={() => handleEdit(key, schema)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                      <Database className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="font-medium text-white">{key}</h3>
                      <p className="text-sm text-slate-400">
                        {schema.catalog_name}.{schema.schema_name}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {catalogExists ? (
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
                        removeSchema(key);
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
            placeholder="e.g., retail_schema"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            hint="A unique identifier for this schema in your config"
            required
            disabled={!!editingKey}
          />

          {/* Mode Toggle */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">Schema Source</label>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => setMode('select')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  mode === 'select'
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
                }`}
              >
                <Database className="w-4 h-4 inline mr-2" />
                Select Existing
              </button>
              <button
                type="button"
                onClick={() => setMode('create')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  mode === 'create'
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
                }`}
              >
                <Plus className="w-4 h-4 inline mr-2" />
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

              <CatalogSelect
                label="Catalog Name"
                value={formData.catalogName}
                onChange={handleCatalogChange}
                hint="Select a Unity Catalog catalog"
                required
              />
              <SchemaSelect
                label="Schema Name"
                value={formData.schemaName}
                onChange={(value) => setFormData({ 
                  ...formData, 
                  schemaName: value,
                  name: formData.name || generateRefName(formData.catalogName, value),
                })}
                catalog={formData.catalogName || null}
                hint="Select a schema within the catalog"
                required
              />
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
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Catalog Name <span className="text-red-400">*</span>
                  </label>
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
                  <p className="text-xs text-slate-500 mt-1">
                    Enter a new catalog name or pick an existing one
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Schema Name <span className="text-red-400">*</span>
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={formData.schemaName}
                      onChange={(e) => {
                        const newSchemaName = e.target.value;
                        setFormData({ 
                          ...formData, 
                          schemaName: newSchemaName,
                          name: formData.name || generateRefName(formData.catalogName, newSchemaName),
                        });
                      }}
                      placeholder="e.g., hardware_store"
                      className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                    {formData.catalogName && schemasList && schemasList.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            setFormData({ 
                              ...formData, 
                              schemaName: e.target.value,
                              name: formData.name || generateRefName(formData.catalogName, e.target.value),
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
                  <p className="text-xs text-slate-500 mt-1">
                    Enter a new schema name or pick an existing one
                  </p>
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
          {formData.catalogName && formData.schemaName && (
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-400 mb-1">Full schema path:</p>
              <code className="text-sm text-white font-mono">
                {formData.catalogName}.{formData.schemaName}
              </code>
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
