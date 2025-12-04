import { useState } from 'react';
import { Copy, Check, FileCode, CheckCircle, XCircle, AlertCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useConfigStore } from '@/stores/configStore';
import { generateYAML } from '@/utils/yaml-generator';
import { useConfigValidation } from '@/hooks/useValidation';
import Button from '../ui/Button';

export default function PreviewPanel() {
  const { config } = useConfigStore();
  const [copied, setCopied] = useState(false);
  const [showErrors, setShowErrors] = useState(true);
  const { isValid, errors, schemaError, isValidating, schemaReady } = useConfigValidation(800);

  const yamlContent = generateYAML(config);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(yamlContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Simple syntax highlighting for YAML
  const highlightYAML = (content: string) => {
    return content.split('\n').map((line, i) => {
      // Comments
      if (line.trim().startsWith('#')) {
        return <span key={i} className="text-slate-500">{line}</span>;
      }
      
      // Keys
      const keyMatch = line.match(/^(\s*)([a-zA-Z_][a-zA-Z0-9_]*):(.*)$/);
      if (keyMatch) {
        const [, indent, key, value] = keyMatch;
        return (
          <span key={i}>
            {indent}
            <span className="text-blue-400">{key}</span>
            <span className="text-slate-400">:</span>
            <span className="text-emerald-400">{value}</span>
          </span>
        );
      }
      
      // List items
      if (line.trim().startsWith('-')) {
        return <span key={i} className="text-amber-400">{line}</span>;
      }
      
      return <span key={i} className="text-slate-300">{line}</span>;
    });
  };

  // Render validation status
  const renderValidationStatus = () => {
    if (!schemaReady) {
      return (
        <div className="flex items-center space-x-2 text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs">Loading schema...</span>
        </div>
      );
    }

    if (isValidating) {
      return (
        <div className="flex items-center space-x-2 text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs">Validating...</span>
        </div>
      );
    }

    if (schemaError) {
      return (
        <div className="flex items-center space-x-2 text-amber-400">
          <AlertCircle className="w-4 h-4" />
          <span className="text-xs" title={schemaError}>Schema error</span>
        </div>
      );
    }

    if (isValid === true) {
      return (
        <div className="flex items-center space-x-2 text-emerald-400">
          <CheckCircle className="w-4 h-4" />
          <span className="text-xs">Valid</span>
        </div>
      );
    }

    if (isValid === false) {
      return (
        <button
          onClick={() => setShowErrors(!showErrors)}
          className="flex items-center space-x-2 text-red-400 hover:text-red-300 transition-colors"
        >
          <XCircle className="w-4 h-4" />
          <span className="text-xs">{errors.length} error{errors.length !== 1 ? 's' : ''}</span>
          {showErrors ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      );
    }

    return null;
  };

  return (
    <div className="h-full flex flex-col bg-slate-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <FileCode className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-300">YAML Preview</span>
        </div>
        <div className="flex items-center space-x-4">
          {renderValidationStatus()}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Validation Errors Panel */}
      {isValid === false && showErrors && errors.length > 0 && (
        <div className="border-b border-slate-800 bg-red-950/30 max-h-48 overflow-auto">
          <div className="px-4 py-2 space-y-1">
            {errors.map((error, i) => (
              <div key={i} className="text-xs flex items-start space-x-2">
                <span className="text-red-400 font-mono shrink-0">
                  {error.path || '/'}
                </span>
                <span className="text-red-300">
                  {error.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Schema Error Panel */}
      {schemaError && (
        <div className="border-b border-slate-800 bg-amber-950/30 px-4 py-2">
          <p className="text-xs text-amber-400">
            <strong>Schema Error:</strong> {schemaError}
          </p>
          <p className="text-xs text-amber-500 mt-1">
            Validation is unavailable. The YAML may still be valid.
          </p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <pre className="code-block text-sm leading-relaxed">
          {highlightYAML(yamlContent).map((line, i) => (
            <div key={i} className="hover:bg-slate-800/30 px-2 -mx-2">
              <span className="inline-block w-8 text-right text-slate-600 mr-4 select-none">
                {i + 1}
              </span>
              {line}
            </div>
          ))}
        </pre>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-800 bg-slate-900/50">
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">
            {yamlContent.split('\n').length} lines • Auto-updates as you configure
          </p>
          {schemaReady && !schemaError && (
            <p className="text-xs text-slate-600">
              Validated against dao-ai schema
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
