import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ProductItem, AppConfig, LogEntry, UploadStats, Catalog } from './types';
import { MetaService } from './services/api';
import { CheckCircleIcon, AlertCircleIcon, UploadCloudIcon, FileJsonIcon, DownloadIcon, LoaderIcon, HelpCircleIcon, InfoIcon, ExternalLinkIcon } from './components/Icons';

const BATCH_SIZE = 50;

// Sample JSON for download (Russian)
// Using standard units for price (e.g. 1500 RUB), not cents.
const SAMPLE_JSON: ProductItem[] = [
  {
    "retailer_id": "TSHIRT_WHITE_001",
    "name": "Футболка Белая Хлопок Premium",
    "price": 1500,
    "description": "100% Хлопок. Плотность 180г/м. Подходит для ежедневной носки. Стирка при 30 градусах.",
    "image_url": "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=500&q=80",
    "brand": "MyBrand",
    "category": "Apparel & Accessories > Clothing > Shirts & Tops",
    "url": "https://myshop.com/products/tshirt-white",
    "availability": "in stock",
    "currency": "RUB",
    "condition": "new"
  },
  {
    "retailer_id": "MUG_CERAMIC_002",
    "name": "Кружка Керамическая 300мл",
    "price": 450,
    "description": "Белая керамическая кружка. Можно мыть в посудомоечной машине.",
    "image_url": "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=500&q=80",
    "category": "Home & Garden > Kitchen & Dining > Tableware > Drinkware > Mugs",
    "currency": "RUB",
    "availability": "in stock"
  },
  {
    "retailer_id": "CREAM_FACE_003",
    "name": "Увлажняющий Крем для лица 50мл",
    "price": 2300,
    "description": "Увлажняющий крем с гиалуроновой кислотой. Для всех типов кожи. Объем 50мл.",
    "image_url": "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=500&q=80",
    "category": "Health & Beauty > Personal Care > Cosmetics > Skin Care",
    "currency": "RUB",
    "availability": "in stock"
  }
];

type HelpTopic = 'token' | 'catalogId' | 'websiteUrl' | 'productsNotVisible' | 'permissionError' | null;

export default function App() {
  // -- State --
  const [config, setConfig] = useState<AppConfig>({ accessToken: '', catalogId: '', websiteUrl: '' });
  const [availableCatalogs, setAvailableCatalogs] = useState<Catalog[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  
  const [items, setItems] = useState<ProductItem[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<UploadStats>({ total: 0, processed: 0, success: 0, failed: 0 });
  const [status, setStatus] = useState<'idle' | 'validating' | 'ready' | 'uploading' | 'completed' | 'error'>('idle');
  const [validationMsg, setValidationMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [helpTopic, setHelpTopic] = useState<HelpTopic>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // -- Effects --
  useEffect(() => {
    // Load config from localStorage on mount
    const savedConfig = localStorage.getItem('wa_uploader_config');
    if (savedConfig) {
      const parsed = JSON.parse(savedConfig);
      setConfig(parsed);
    }
  }, []);

  useEffect(() => {
    // Save config changes
    if (config.accessToken) {
      localStorage.setItem('wa_uploader_config', JSON.stringify(config));
    }
  }, [config]);

  // -- Helpers --
  const getCatalogUrl = (id: string, bizId?: string | null) => {
    // New Meta Commerce Manager URL structure
    let url = `https://business.facebook.com/commerce_manager/${id}/items`;
    // Adding business_id is CRITICAL for permissions context
    if (bizId) {
      url += `?business_id=${bizId}`;
    }
    return url;
  };

  const addLog = useCallback((type: LogEntry['type'], message: string, details?: string) => {
    setLogs(prev => [{
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      type,
      message,
      details
    }, ...prev]);
  }, []);

  const clearSession = () => {
    setItems([]);
    setLogs([]);
    setStats({ total: 0, processed: 0, success: 0, failed: 0 });
    setStatus('idle');
    setValidationMsg(null);
    if(fileInputRef.current) fileInputRef.current.value = '';
  };

  const downloadReport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `upload_report_${new Date().toISOString()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const downloadSample = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(SAMPLE_JSON, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "sample_products.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  // -- Handlers --
  const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setConfig(prev => ({ ...prev, [name]: value }));
    
    // If token changes, reset catalog list
    if (name === 'accessToken') {
      setAvailableCatalogs([]);
      setStatus('idle');
    }

    // If catalog changes, try to find associated business ID for the link
    if (name === 'catalogId') {
       if (value === 'manual') {
         setSelectedBusinessId(null);
       } else {
         const selectedCat = availableCatalogs.find(c => c.id === value);
         setSelectedBusinessId(selectedCat?.business_id || null);
       }
    }

    setValidationMsg(null);
  };

  const validateConnection = async (manualCheck = false): Promise<boolean> => {
    if (!config.accessToken) {
      if (manualCheck) {
        setValidationMsg({ type: 'error', text: 'Введите Access Token' });
        addLog('error', 'Отсутствует Access Token');
      }
      return false;
    }
    
    setStatus('validating');
    if (manualCheck) addLog('info', 'Проверка токена и поиск каталогов...');
    
    try {
      // 1. Validate Token
      const user = await MetaService.validateToken(config.accessToken);
      // Only log on manual check to avoid spam
      if (manualCheck) addLog('success', `Токен действителен. User ID: ${user.id}`);

      // 2. Fetch Catalogs (Auto-discovery)
      const catalogs = await MetaService.getUserCatalogs(config.accessToken);
      setAvailableCatalogs(catalogs);
      
      if (catalogs.length > 0) {
        if (manualCheck) addLog('info', `Найдено каталогов: ${catalogs.length}`);
        
        // If current config.catalogId exists in the list, update selectedBusinessId
        if (config.catalogId && config.catalogId !== 'manual') {
            const currentCat = catalogs.find(c => c.id === config.catalogId);
            if (currentCat) setSelectedBusinessId(currentCat.business_id || null);
        }

      } else {
         if (manualCheck) addLog('warning', 'Каталоги не найдены. Убедитесь, что у токена есть права catalog_management.');
      }

      // 3. Validate Specific Catalog if ID is present
      if (config.catalogId) {
        // Smart Check for non-numeric IDs (like URLs)
        if (/[^0-9]/.test(config.catalogId) && config.catalogId !== 'manual') {
             const errorMsg = 'ID каталога должен содержать только цифры. Не вставляйте ссылки (wa.me или facebook.com).';
             setValidationMsg({ type: 'error', text: errorMsg });
             if (manualCheck) addLog('error', 'Неверный формат ID', errorMsg);
             setStatus('error');
             return false;
        }

        if (config.catalogId === 'manual') {
             // Just pass for manual entry mode waiting for user input
             setStatus('idle');
             return false;
        }

        try {
          const catalog = await MetaService.validateCatalog(config.catalogId, config.accessToken);
          if (manualCheck) addLog('success', `Каталог подтвержден: ${catalog.name} (${catalog.vertical || 'Generic'})`);
          setValidationMsg({ type: 'success', text: 'Подключение успешно' });
          setStatus('ready');
          return true;
        } catch (catErr) {
          if (manualCheck) addLog('error', 'Каталог не найден или нет доступа');
          setValidationMsg({ type: 'error', text: 'Ошибка доступа к каталогу' });
          setStatus('error'); // Token ok, Catalog bad
          return false;
        }
      } else {
         // Token ok, No catalog selected
         setValidationMsg({ type: 'success', text: 'Токен верный. Выберите каталог.' });
         setStatus('idle'); // Still need catalog
         return false;
      }
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      const errorMsg = err.message || JSON.stringify(err);
      if (manualCheck) addLog('error', 'Ошибка проверки', errorMsg);
      setValidationMsg({ type: 'error', text: errorMsg });
      return false;
    }
  };

  const handleFileUpload = (file: File) => {
    // Relaxed check: accepts JSON extension OR json mime type
    const isValidType = file.type === 'application/json' || file.name.toLowerCase().endsWith('.json');

    if (!isValidType) {
      addLog('error', 'Неверный тип файла. Загрузите .json');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        if (!content) throw new Error("Файл пуст");

        const json = JSON.parse(content);
        if (!Array.isArray(json)) {
          throw new Error("JSON должен быть массивом [...]");
        }
        
        // Basic schema check
        const validItems = json.filter((item: any) => {
          const hasId = !!item.retailer_id;
          const hasName = !!item.name;
          // Price should be a number or numeric string
          const hasPrice = item.price !== undefined && !isNaN(Number(item.price));
          
          if(!hasId || !hasName || !hasPrice) {
             return false;
          }
          return true;
        });

        if (validItems.length === 0) {
           addLog('error', 'В файле нет валидных товаров (нужны retailer_id, name, price).');
           return;
        }

        // WhatsApp Specific Warnings
        const itemsWithImages = validItems.filter(i => !!i.image_url);
        if (itemsWithImages.length < validItems.length) {
            addLog('warning', `Внимание: У ${validItems.length - itemsWithImages.length} товаров нет картинки (image_url). WhatsApp может их отклонить.`);
        }

        setItems(validItems);
        setStats(s => ({ ...s, total: validItems.length }));
        addLog('info', `Файл "${file.name}" загружен. ${validItems.length} товаров готовы к отправке.`);
        
        // Auto validate if credentials present
        if (config.accessToken && config.catalogId && config.catalogId !== 'manual') {
            validateConnection(false);
        }
      } catch (err) {
        addLog('error', 'Ошибка парсинга JSON', (err as Error).message);
      }
    };
    reader.onerror = () => {
        addLog('error', 'Ошибка чтения файла');
    };
    reader.readAsText(file);
  };

  const startUpload = async () => {
    if (status === 'uploading') return;
    if (items.length === 0) {
      addLog('warning', 'Нет товаров для загрузки');
      return;
    }

    if (!config.catalogId || config.catalogId === 'manual') {
        setValidationMsg({type:'error', text: 'Не выбран валидный ID каталога'});
        return;
    }

    // Ensure valid connection before start
    const isValid = await validateConnection(true);
    if (!isValid) return;

    setStatus('uploading');
    setStats(s => ({ ...s, processed: 0, success: 0, failed: 0 }));
    addLog('info', 'Начинается пакетная загрузка...');

    let processedCount = 0;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      
      try {
        addLog('info', `Загрузка пакета #${batchNum} (${batch.length} товаров)...`);
        
        const result = await MetaService.uploadBatch(
          config.catalogId, 
          config.accessToken, 
          batch,
          config.websiteUrl
        );

        if (result.error) {
           throw result.error;
        }

        // Check for partial errors or success handles
        if (result.handles && Array.isArray(result.handles)) {
           successCount += batch.length;
           addLog('success', `Пакет #${batchNum} отправлен на обработку.`);
        } else {
           // Fallback if no handles returned but no error (rare)
           successCount += batch.length;
           addLog('success', `Пакет #${batchNum} отправлен.`);
        }
        
      } catch (err: any) {
        failCount += batch.length;
        const errMsg = err.message || (err.error ? err.error.message : 'Неизвестная ошибка');
        addLog('error', `Пакет #${batchNum} ошибка`, errMsg);
      }

      processedCount += batch.length;
      setStats({
        total: items.length,
        processed: processedCount,
        success: successCount,
        failed: failCount
      });

      await new Promise(r => setTimeout(r, 500));
    }

    setStatus('completed');
    addLog('info', 'Процесс загрузки завершен.');
    addLog('info', 'Товары появились в очереди на модерацию в Commerce Manager.');
  };

  // -- UI Components --

  const renderHelpModal = () => {
    if (!helpTopic) return null;

    let title = "";
    let content = null;

    switch (helpTopic) {
      case 'token':
        title = "Где найти Access Token?";
        content = (
          <div className="space-y-4 text-sm text-slate-600">
            <p>Для работы требуется <b>User Access Token</b> с правами <code>catalog_management</code>.</p>
            <ol className="list-decimal pl-5 space-y-2">
              <li>Зайдите в <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer" className="text-wa-dark underline">Graph API Explorer</a>.</li>
              <li>Выберите приложение и нажмите "Get Token".</li>
              <li><b>Важно:</b> Выберите разрешение <code>catalog_management</code>.</li>
              <li>Сгенерируйте токен.</li>
            </ol>
            <p className="mt-2 text-xs text-slate-500 bg-slate-100 p-2 rounded">
               Совет: Если токен валиден, но каталогов 0 — убедитесь, что вы добавлены в каталог в Business Settings -> Data Sources -> Catalogs -> Assign People.
            </p>
          </div>
        );
        break;
      case 'catalogId':
        title = "Как выбрать Каталог?";
        content = (
          <div className="space-y-4 text-sm text-slate-600">
            <p>Способы:</p>
            <ol className="list-decimal pl-5 space-y-2">
              <li><b>Автоматически (Рекомендуется):</b> Введите токен и нажмите кнопку 🔍. Выберите каталог из списка.</li>
              <li><b>Вручную:</b> Найдите ID в Commerce Manager. Это длинный набор цифр.</li>
            </ol>
            <div className="bg-red-50 border border-red-100 p-2 rounded text-red-800 text-xs mt-2">
               Не используйте ссылки вида <code>wa.me/c/...</code> — это ссылки для клиентов, а не ID для загрузки.
            </div>
          </div>
        );
        break;
      case 'websiteUrl':
        title = "Что такое URL веб-сайта?";
        content = (
          <div className="space-y-4 text-sm text-slate-600">
            <p>Это ссылка по умолчанию на карточку товара.</p>
            <p>WhatsApp требует, чтобы у каждого товара была ссылка (поле <code>url</code>). Если вы не укажете её в JSON для конкретного товара, программа подставит этот общий адрес.</p>
          </div>
        );
        break;
      case 'productsNotVisible':
        title = "Почему я не вижу товары?";
        content = (
          <div className="space-y-4 text-sm text-slate-600">
             <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-yellow-800 mb-3">
               <strong>Важно:</strong> Загрузка ≠ Мгновенное появление.
             </div>
             <p>Этапы:</p>
             <ol className="list-decimal pl-5 space-y-2">
               <li><b>API:</b> Принимает товар (статус Success).</li>
               <li><b>Обработка:</b> Meta проверяет поля (цена, картинка).</li>
               <li><b>Модерация:</b> Проверка политик (занимает 5-30 мин).</li>
             </ol>
             <p className="mt-3">
               <strong>Советы для ускорения:</strong>
               <ul className="list-disc pl-5 mt-1 text-xs text-slate-500">
                 <li>Белый фон на фото.</li>
                 <li>Отсутствие слов "Скидка", "Акция" в названии.</li>
                 <li>Реальное описание товара.</li>
               </ul>
             </p>
          </div>
        );
        break;
      case 'permissionError':
        title = "Ошибка доступа (Permission Error)";
        content = (
          <div className="space-y-4 text-sm text-slate-600">
            <div className="bg-red-50 text-red-800 p-3 rounded">
              "У вас нет разрешения на просмотр..."
            </div>
            <p>Если API работает, но ссылка не открывается:</p>
            <ol className="list-decimal pl-5 space-y-2">
              <li><b>Выбрана не та компания:</b> Наша программа пытается добавить <code>?business_id=...</code> в ссылку. Попробуйте выбрать каталог из списка заново.</li>
              <li><b>Нет прав в UI:</b> Зайдите в <a href="https://business.facebook.com/settings" target="_blank" className="underline text-blue-600">Настройки компании</a> -> Data Sources -> Catalogs. Найдите каталог и нажмите <b>"Add People"</b>, добавьте себя с полным доступом.</li>
            </ol>
          </div>
        );
        break;
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setHelpTopic(null)}>
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <h3 className="font-bold text-slate-800">{title}</h3>
            <button onClick={() => setHelpTopic(null)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
          </div>
          <div className="p-6 overflow-y-auto max-h-[70vh]">
            {content}
          </div>
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
            <button onClick={() => setHelpTopic(null)} className="px-4 py-2 bg-slate-800 text-white text-sm rounded-lg hover:bg-slate-700">Понятно</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {renderHelpModal()}
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-wa rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-wa/30">
            WA
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">Загрузчик Каталога WhatsApp</h1>
            <p className="text-xs text-slate-500 font-medium">Meta Commerce Batch API (v20.0)</p>
          </div>
        </div>
        <div className="flex gap-3 items-center">
          <button onClick={() => setHelpTopic('productsNotVisible')} className="text-sm text-slate-600 hover:text-wa font-medium hidden md:block">
            Где мои товары?
          </button>
          <div className="h-4 w-px bg-slate-300 hidden md:block"></div>
          <button onClick={downloadSample} className="text-sm text-wa-dark hover:text-wa font-medium flex items-center gap-1 transition-colors">
            <DownloadIcon className="w-4 h-4" /> Скачать образец
          </button>
          <a href="https://developers.facebook.com/docs/commerce-platform/catalog/batch-api" target="_blank" rel="noreferrer" className="text-sm text-slate-500 hover:text-slate-800 transition-colors">
            Docs ↗
          </a>
        </div>
      </header>

      {/* Main Content Grid */}
      <main className="flex-1 overflow-hidden flex flex-col md:flex-row">
        
        {/* Left Panel: Configuration & Input */}
        <div className="w-full md:w-1/3 lg:w-[400px] bg-white border-r border-slate-200 flex flex-col overflow-y-auto custom-scrollbar shrink-0 z-10">
          <div className="p-6 space-y-6">
            
            {/* Credentials Form */}
            <div className="space-y-4">
              <h2 className="text-sm uppercase tracking-wider text-slate-400 font-bold mb-2">Настройки подключения</h2>
              
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-medium text-slate-700">Access Token</label>
                  <button onClick={() => setHelpTopic('token')} className="text-slate-400 hover:text-wa text-xs flex items-center gap-1">
                    <HelpCircleIcon className="w-3 h-3" /> Справка
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    name="accessToken"
                    value={config.accessToken}
                    onChange={handleConfigChange}
                    className="flex-1 rounded-md border-slate-300 bg-slate-50 border px-3 py-2 text-sm focus:border-wa focus:ring-1 focus:ring-wa transition-all outline-none"
                    placeholder="EAAG..."
                  />
                  <button 
                    onClick={() => validateConnection(true)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-md text-sm border border-slate-200"
                    title="Проверить токен и найти каталоги"
                  >
                    🔍
                  </button>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-medium text-slate-700">ID Каталога</label>
                  <button onClick={() => setHelpTopic('catalogId')} className="text-slate-400 hover:text-wa text-xs flex items-center gap-1">
                    <HelpCircleIcon className="w-3 h-3" /> Где найти?
                  </button>
                </div>
                
                {availableCatalogs.length > 0 ? (
                  <select
                    name="catalogId"
                    value={config.catalogId}
                    onChange={handleConfigChange}
                    className="w-full rounded-md border-slate-300 bg-slate-50 border px-3 py-2 text-sm focus:border-wa focus:ring-1 focus:ring-wa transition-all outline-none mb-2"
                  >
                    <option value="">-- Выберите каталог --</option>
                    {availableCatalogs.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name} ({cat.id})
                      </option>
                    ))}
                    <option value="manual">Ввести ID вручную...</option>
                  </select>
                ) : null}

                {(availableCatalogs.length === 0 || config.catalogId === 'manual' || !availableCatalogs.find(c => c.id === config.catalogId)) && (
                   <input
                    type="text"
                    name="catalogId"
                    value={config.catalogId === 'manual' ? '' : config.catalogId}
                    onChange={handleConfigChange}
                    className="w-full rounded-md border-slate-300 bg-slate-50 border px-3 py-2 text-sm focus:border-wa focus:ring-1 focus:ring-wa transition-all outline-none"
                    placeholder="Введите ID каталога (только цифры)"
                  />
                )}
                
                {config.catalogId && config.catalogId !== 'manual' && config.catalogId.length > 5 && (
                  <div className="flex items-center gap-2 mt-2">
                     <a href={getCatalogUrl(config.catalogId, selectedBusinessId)} target="_blank" rel="noreferrer" className="text-xs text-wa-dark inline-flex items-center hover:underline group">
                        <ExternalLinkIcon className="w-3 h-3 mr-1 text-wa-dark group-hover:text-wa"/> 
                        Открыть в Commerce Manager
                     </a>
                     <button onClick={() => setHelpTopic('permissionError')} className="text-[10px] text-red-400 underline hover:text-red-600">Ошибка доступа?</button>
                  </div>
                )}
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-medium text-slate-700">URL сайта (fallback)</label>
                  <button onClick={() => setHelpTopic('websiteUrl')} className="text-slate-400 hover:text-wa text-xs flex items-center gap-1">
                    <InfoIcon className="w-3 h-3" />
                  </button>
                </div>
                <input
                  type="url"
                  name="websiteUrl"
                  value={config.websiteUrl}
                  onChange={handleConfigChange}
                  className="w-full rounded-md border-slate-300 bg-slate-50 border px-3 py-2 text-sm focus:border-wa focus:ring-1 focus:ring-wa transition-all outline-none"
                  placeholder="https://myshop.com"
                />
              </div>

              {validationMsg && (
                <div className={`text-xs p-3 rounded-md flex items-start gap-2 ${
                  validationMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  <div className="mt-0.5 shrink-0">
                    {validationMsg.type === 'success' ? <CheckCircleIcon className="w-4 h-4" /> : <AlertCircleIcon className="w-4 h-4" />}
                  </div>
                  <span className="break-words">{validationMsg.text}</span>
                </div>
              )}
            </div>

            <hr className="border-slate-100" />

            {/* File Upload */}
            <div className="space-y-4">
              <h2 className="text-sm uppercase tracking-wider text-slate-400 font-bold">Файл товаров (JSON)</h2>
              
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 relative group cursor-pointer ${
                  isDragOver ? 'border-wa bg-wa/5' : 'border-slate-300 hover:border-wa hover:bg-slate-50'
                }`}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0]);
                }}
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  accept=".json"
                  onClick={(e) => (e.currentTarget.value = '')}
                  onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                
                <div className="pointer-events-none flex flex-col items-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${items.length > 0 ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400 group-hover:text-wa'}`}>
                    {items.length > 0 ? <FileJsonIcon className="w-6 h-6" /> : <UploadCloudIcon className="w-6 h-6" />}
                  </div>
                  <div>
                    {items.length > 0 ? (
                      <>
                        <p className="text-slate-800 font-medium">{items.length} Товаров</p>
                        <p className="text-xs text-slate-500 mt-1">Нажмите для замены</p>
                      </>
                    ) : (
                      <>
                        <p className="text-slate-700 font-medium">Загрузить JSON</p>
                        <p className="text-xs text-slate-400 mt-1">drag & drop</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Button */}
            <div className="pt-2">
              <button
                onClick={startUpload}
                disabled={status === 'uploading' || items.length === 0}
                className="w-full bg-wa hover:bg-wa-dark disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg shadow-lg shadow-wa/20 transition-all flex items-center justify-center gap-2"
              >
                {status === 'uploading' ? (
                  <>
                    <LoaderIcon className="w-5 h-5 animate-spin" />
                    Загрузка...
                  </>
                ) : (
                  'Начать загрузку'
                )}
              </button>
              {items.length > 0 && (
                 <button onClick={clearSession} className="w-full mt-3 text-xs text-slate-400 hover:text-red-500 underline">
                   Очистить все
                 </button>
              )}
            </div>

          </div>
        </div>

        {/* Right Panel: Logs */}
        <div className="flex-1 bg-slate-50 flex flex-col overflow-hidden">
          
          {/* Stats Bar */}
          <div className="bg-white border-b border-slate-200 p-6 grid grid-cols-2 md:grid-cols-4 gap-4 shadow-sm z-10">
            <StatCard label="Всего" value={stats.total} color="text-slate-800" />
            <StatCard label="Обработано" value={stats.processed} color="text-blue-600" />
            <StatCard label="Успешно" value={stats.success} color="text-green-600" />
            <StatCard label="Ошибки" value={stats.failed} color="text-red-600" />
          </div>

          {/* Progress Bar */}
          {stats.total > 0 && (
            <div className="h-1 w-full bg-slate-200">
              <div 
                className="h-full bg-wa transition-all duration-300 ease-out"
                style={{ width: `${(stats.processed / stats.total) * 100}%` }}
              />
            </div>
          )}

          {/* Logs Table */}
          <div className="flex-1 overflow-auto p-6 custom-scrollbar">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">Журнал событий</h3>
              <div className="flex gap-2">
                {config.catalogId && config.catalogId !== 'manual' && config.catalogId.length > 5 && (
                  <a 
                    href={getCatalogUrl(config.catalogId, selectedBusinessId)} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="text-xs bg-white border border-slate-300 text-wa-dark hover:text-wa hover:border-wa px-3 py-1.5 rounded font-medium transition-all flex items-center gap-1"
                  >
                    Открыть каталог <ExternalLinkIcon className="w-3 h-3"/>
                  </a>
                )}
                {logs.length > 0 && (
                  <button onClick={downloadReport} className="text-xs bg-white border border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded text-slate-600 font-medium transition-colors">
                    Скачать лог
                  </button>
                )}
              </div>
            </div>
            
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden min-h-[200px]">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-3 font-medium w-24">Время</th>
                      <th className="px-4 py-3 font-medium w-24">Тип</th>
                      <th className="px-4 py-3 font-medium">Сообщение</th>
                      <th className="px-4 py-3 font-medium w-1/3">Детали</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-12 text-center text-slate-400 italic">
                          Готов к работе
                        </td>
                      </tr>
                    ) : (
                      logs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                            {log.timestamp.toLocaleTimeString()}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize
                              ${log.type === 'success' ? 'bg-green-100 text-green-800' : ''}
                              ${log.type === 'error' ? 'bg-red-100 text-red-800' : ''}
                              ${log.type === 'warning' ? 'bg-yellow-100 text-yellow-800' : ''}
                              ${log.type === 'info' ? 'bg-blue-100 text-blue-800' : ''}
                            `}>
                              {log.type === 'info' ? 'Инфо' : log.type === 'success' ? 'Успех' : log.type === 'error' ? 'Ошибка' : 'Внимание'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-800 font-medium">
                            {log.message}
                          </td>
                          <td className="px-4 py-3 text-slate-500 font-mono text-xs break-all">
                            {log.details || '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

const StatCard = ({ label, value, color }: { label: string, value: number, color: string }) => (
  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
    <p className="text-xs text-slate-500 uppercase font-semibold mb-1">{label}</p>
    <p className={`text-2xl font-bold ${color}`}>{value}</p>
  </div>
);