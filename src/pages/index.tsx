// src/pages/index.tsx
import { useEffect, useState } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';

interface Product {
  PRD_ID: number;
  CODE: string;
  NAME: string;
  PRICE: number;
}

interface Transaction {
  TRD_ID: number;
  DATETIME: string;
  EMP_CD: string;
  STORE_CD: string;
  POS_NO: string;
  TOTAL_AMT: number;
}

// フロント管理用カート (数量を保持)
interface CartItem {
  PRD_ID: number;
  CODE: string;
  NAME: string;
  PRICE: number;
  quantity: number;
}

export default function HomePage() {
  // --- バックエンドURL: .envがあればそれを優先し、なければ直書き ---
  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_API_URL ||
    "https://tech0-gen8-step4-pos-app-40.azurewebsites.net";

  // 取引ID (バックエンドで作成したもの)
  const [transactionId, setTransactionId] = useState<number | null>(null);

  // バーコード or 手動入力で使う
  const [productCode, setProductCode] = useState('');
  const [foundProduct, setFoundProduct] = useState<Product | null>(null);
  const [productError, setProductError] = useState('');

  // フロント側カート
  const [cart, setCart] = useState<CartItem[]>([]);

  // バーコードスキャン関連
  const [isScanning, setIsScanning] = useState(false);
  const [scannerControls, setScannerControls] = useState<IScannerControls | null>(null);

  // ======================
  // (1) 新規取引作成 (初回のみ)
  // ======================
  useEffect(() => {
    async function createTransaction() {
      try {
        const now = new Date().toISOString();
        const body = {
          DATETIME: now,
          EMP_CD: 'EMP01',
          STORE_CD: '30',
          POS_NO: '90',
          TOTAL_AMT: 0,
        };
        const res = await fetch(`${backendUrl}/api/transactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          console.error('取引作成に失敗:', await res.text());
          return;
        }
        const data: Transaction = await res.json();
        setTransactionId(data.TRD_ID);
        console.log('New transaction ID:', data.TRD_ID);
      } catch (error) {
        console.error('取引作成APIエラー:', error);
      }
    }
    createTransaction();
  }, [backendUrl]);

  // =====================================
  // (2) 商品コードで検索 + カートに追加
  // =====================================
  async function fetchProductByCode(code: string) {
    if (!code) return;
    setFoundProduct(null);
    setProductError('');

    try {
      const res = await fetch(`${backendUrl}/api/products-by-code/${code}`);
      if (res.status === 404) {
        setFoundProduct(null);
        setProductError('商品がマスタ未登録です');
        return;
      }
      if (!res.ok) {
        console.error('商品検索エラー:', await res.text());
        alert('商品検索に失敗しました');
        return;
      }
      const data: Product = await res.json();
      setFoundProduct(data);
      setProductError('');

      // カートに自動追加(同じCODEなら数量+1)
      autoAddToCart(data);
    } catch (error) {
      console.error('商品読み込みエラー:', error);
      alert('商品読み込みに失敗しました');
    }
  }

  // ==============
  // カートに追加 or 数量+1
  // ==============
  function autoAddToCart(product: Product) {
    setCart((prev) => {
      const idx = prev.findIndex(item => item.CODE === product.CODE);
      if (idx !== -1) {
        // 数量+1
        const newCart = [...prev];
        newCart[idx].quantity += 1;
        return newCart;
      } else {
        // 新規
        return [
          ...prev,
          {
            PRD_ID: product.PRD_ID,
            CODE: product.CODE,
            NAME: product.NAME,
            PRICE: product.PRICE,
            quantity: 1,
          }
        ];
      }
    });
  }

  // =========================
  // (3) 手動入力: ボタン押下
  // =========================
  function handleManualRead() {
    fetchProductByCode(productCode);
  }

  // =====================
  // (4) バーコード開始/停止
  // =====================
  function handleToggleScan() {
    if (!isScanning) {
      setIsScanning(true);
    } else {
      if (scannerControls) {
        scannerControls.stop();
        setScannerControls(null);
      }
      setIsScanning(false);
    }
  }

  // ============================
  // (5) カメラ起動 & バーコード解析
  // ============================
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isScanning) return;
    const codeReader = new BrowserMultiFormatReader();
    const videoElem = document.getElementById('video-preview') as HTMLVideoElement | null;
    if (!videoElem) return;

    codeReader.decodeFromVideoDevice(undefined, videoElem, (result, error, controls) => {
      if (result) {
        const scannedCode = result.getText();
        console.log('Scanned code:', scannedCode);

        // カメラ停止
        if (controls) {
          controls.stop();
          setScannerControls(null);
        }
        setIsScanning(false);

        setProductCode(scannedCode);
        fetchProductByCode(scannedCode);
      }
      // errorは未検出等のため頻繁に呼ばれる => ログ抑制
    })
      .then((ctrls) => {
        setScannerControls(ctrls);
      })
      .catch((err) => {
        console.error('Camera access error:', err);
        alert('カメラにアクセスできません（HTTPSが必要など）');
        setIsScanning(false);
      });

    // クリーンアップ
    return () => {
      if (scannerControls) {
        scannerControls.stop();
      }
    };
  }, [isScanning]);

  // ============================
  // (6) カート上: 削除ボタン
  // ============================
  function handleRemoveItem(code: string) {
    setCart((prev) => prev.filter(item => item.CODE !== code));
  }

  // ===============================
  // (7) カート上: 数量変更(1~99)
  // ===============================
  function handleChangeQuantity(code: string) {
    const input = window.prompt("数量を入力(1～99)", "1");
    if (!input) return;
    const newQty = parseInt(input, 10);
    if (Number.isNaN(newQty) || newQty < 1 || newQty > 99) {
      alert("数量は1～99の範囲で入力してください");
      return;
    }
    setCart((prev) =>
      prev.map(item => {
        if (item.CODE === code) {
          return { ...item, quantity: newQty };
        }
        return item;
      })
    );
  }

  // ============================
  // (8) 購入 => DBに一括登録
  // ============================
  async function handlePurchase() {
    if (!transactionId) {
      alert("取引IDが未取得です");
      return;
    }

    // カートの内容を transaction_details に登録 (サーバは数量列なし => 個数分POST)
    for (const item of cart) {
      for (let i = 0; i < item.quantity; i++) {
        await registerDetail(item);
      }
    }

    // サーバから合計金額を再取得 & 表示
    try {
      const res = await fetch(`${backendUrl}/api/transactions/${transactionId}`);
      if (!res.ok) {
        alert('取引情報の取得に失敗しました');
        return;
      }
      const data: Transaction = await res.json();
      const totalTaxIncluded = Math.round(data.TOTAL_AMT * 1.1);
      alert(`購入が完了しました！\n合計金額（税込）: ${totalTaxIncluded} 円`);
    } catch (err) {
      console.error('購入完了後のAPI失敗:', err);
    }

    // カートをクリア
    setCart([]);
    setProductCode('');
    setFoundProduct(null);
    setProductError('');
  }

  // ===============
  // 明細を1行登録
  // ===============
  async function registerDetail(item: CartItem) {
    if (!transactionId) return;

    // DTL_ID はユニークにする必要 => 簡易的にランダム
    const detailBody = {
      DTL_ID: Math.floor(Math.random() * 1000000),
      PRD_ID: item.PRD_ID,
      PRD_CODE: item.CODE,
      PRD_NAME: item.NAME,
      PRD_PRICE: item.PRICE,
    };
    const res = await fetch(`${backendUrl}/api/transactions/${transactionId}/details`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(detailBody),
    });
    if (!res.ok) {
      console.error('明細登録失敗:', await res.text());
      alert('明細登録に失敗しました');
    }
  }

  // フロント計算の合計(税抜)
  const totalWithoutTax = cart.reduce((sum, item) => sum + item.PRICE * item.quantity, 0);

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Web画面POSアプリ</h1>

      {/* (4) スキャンボタン */}
      <button onClick={handleToggleScan} style={{ marginBottom: '8px' }}>
        {isScanning ? 'スキャン停止' : 'バーコードスキャン'}
      </button>
      {isScanning && (
        <div style={{ marginBottom: '8px' }}>
          <p>カメラ起動中...</p>
          <video
            id="video-preview"
            style={{ width: '100%', maxWidth: '400px', border: '1px solid #ccc' }}
            autoPlay
          />
        </div>
      )}

      {/* 手動入力 */}
      <div style={{ marginBottom: '8px' }}>
        <input
          type="text"
          placeholder="商品コードを入力"
          value={productCode}
          onChange={(e) => setProductCode(e.target.value)}
          style={{ width: '200px', marginRight: '8px' }}
        />
        <button onClick={handleManualRead}>商品コード 読み込み</button>
      </div>

      {/* 名称/単価表示 */}
      <div style={{ marginBottom: '8px' }}>
        {productError ? (
          <p style={{ color: 'red' }}>{productError}</p>
        ) : foundProduct ? (
          <>
            <input
              type="text"
              readOnly
              value={foundProduct.NAME}
              style={{ display: 'block', marginBottom: '4px' }}
            />
            <input
              type="text"
              readOnly
              value={`${foundProduct.PRICE}円`}
              style={{ display: 'block', marginBottom: '4px' }}
            />
            <p style={{ color: 'blue' }}>
              カートに自動追加されました (サーバ未登録)
            </p>
          </>
        ) : (
          <p style={{ color: '#666' }}>名称／単価がここに表示されます</p>
        )}
      </div>

      {/* 購入リスト */}
      <div style={{ border: '1px solid #ccc', padding: '10px', marginBottom: '8px' }}>
        <h3>購入リスト</h3>
        {cart.length === 0 ? (
          <p>リストが空です</p>
        ) : (
          <ul>
            {cart.map((item) => {
              const lineTotal = item.PRICE * item.quantity;
              return (
                <li key={item.CODE} style={{ marginBottom: '8px' }}>
                  {item.NAME}　
                  単価: {item.PRICE}円　
                  数量: {item.quantity}　
                  小計: {lineTotal}円

                  <button style={{ marginLeft: '8px' }} onClick={() => handleRemoveItem(item.CODE)}>
                    リストから削除
                  </button>
                  <button style={{ marginLeft: '8px' }} onClick={() => handleChangeQuantity(item.CODE)}>
                    数量変更
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p style={{ marginTop: '8px' }}>合計金額(税抜): {totalWithoutTax}円</p>
      </div>

      {/* 購入ボタン => DBに一括登録 */}
      <button onClick={handlePurchase} style={{ fontSize: '1.1em', padding: '6px 16px' }}>
        購入
      </button>
    </div>
  );
}
