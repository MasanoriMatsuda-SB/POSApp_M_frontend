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

interface CartItem {
  CODE: string;
  NAME: string;
  PRICE: number;
  quantity: number;
}

export default function HomePage() {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'https://example.azurewebsites.net';

  const [transactionId, setTransactionId] = useState<number | null>(null);

  // 入力またはバーコード読み取りで得た商品コード
  const [productCode, setProductCode] = useState('');
  // 最後に読み取った商品情報
  const [foundProduct, setFoundProduct] = useState<Product | null>(null);
  const [productError, setProductError] = useState('');

  // 購入リスト
  const [cart, setCart] = useState<CartItem[]>([]);

  // スキャン関連
  const [isScanning, setIsScanning] = useState(false);
  const [scannerControls, setScannerControls] = useState<IScannerControls | null>(null);

  // ========== (1) 新規取引の作成 (マウント時に一度だけ) ==========
  useEffect(() => {
    const createTransaction = async () => {
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
          console.error('取引作成に失敗しました');
          return;
        }
        const data: Transaction = await res.json();
        setTransactionId(data.TRD_ID);
        console.log('New transaction ID:', data.TRD_ID);
      } catch (error) {
        console.error('取引作成エラー:', error);
      }
    };
    createTransaction();
  }, [backendUrl]);

  // ========== 商品コードをキーに商品情報を取得 & 自動でカート追加 ==========
  const fetchProductByCode = async (code: string) => {
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
        const text = await res.text();
        console.error('fetchProductByCode error:', text);
        alert('商品検索に失敗しました');
        return;
      }
      const data: Product = await res.json();
      // 取得成功 → foundProduct更新
      setFoundProduct(data);
      setProductError('');
      // 自動で購入リストへ追加 (同じ商品コードがあれば数量+1)
      autoAddToCart(data);
    } catch (error) {
      console.error('商品コード読み込みエラー:', error);
      alert('読み込みに失敗しました');
    }
  };

  // ========== (2) 自動カート追加: 同じ商品コードなら数量+1, なければ追加 ==========
  const autoAddToCart = (product: Product) => {
    setCart((prevCart) => {
      const existingIndex = prevCart.findIndex(item => item.CODE === product.CODE);
      if (existingIndex !== -1) {
        // 同じコードの商品が既にある → 数量+1
        const updatedCart = [...prevCart];
        updatedCart[existingIndex] = {
          ...updatedCart[existingIndex],
          quantity: updatedCart[existingIndex].quantity + 1,
        };
        return updatedCart;
      } else {
        // 新規追加
        return [
          ...prevCart,
          {
            CODE: product.CODE,
            NAME: product.NAME,
            PRICE: product.PRICE,
            quantity: 1,
          }
        ];
      }
    });
  };

  // ========== (3) 手動入力: 読み込みボタンで商品取得 ==========
  const handleManualRead = () => {
    fetchProductByCode(productCode);
  };

  // ========== (4) スキャン開始/停止 ==========
  const handleToggleScan = () => {
    if (!isScanning) {
      setIsScanning(true);
    } else {
      if (scannerControls) {
        scannerControls.stop();
        setScannerControls(null);
      }
      setIsScanning(false);
    }
  };

  // ========== カメラ起動 & バーコード解析: 成功したら自動 fetchProductByCode ==========
  useEffect(() => {
    if (!isScanning) return;
    const codeReader = new BrowserMultiFormatReader();
    const videoElement = document.getElementById('video-preview') as HTMLVideoElement | null;
    if (!videoElement) return;

    codeReader.decodeFromVideoDevice(undefined, videoElement, (result, error, controls) => {
      if (result) {
        const scannedCode = result.getText();
        console.log('Scanned code:', scannedCode);

        // カメラ停止
        if (controls) {
          controls.stop();
          setScannerControls(null);
        }
        setIsScanning(false);

        // 自動取得 → カートに入れる
        setProductCode(scannedCode);
        fetchProductByCode(scannedCode);
      }
      // errorは頻繁に出るのでログ抑制
    })
    .then((controls) => {
      setScannerControls(controls);
    })
    .catch((err) => {
      console.error('Camera access error:', err);
      alert('カメラにアクセスできません。HTTPSでアクセスしているかをご確認ください。');
      setIsScanning(false);
    });

    // アンマウント時にカメラ停止
    return () => {
      if (scannerControls) {
        scannerControls.stop();
      }
    };
  }, [isScanning]);

  // ========== (5) 購入リスト: アイテム削除 ==========
  const handleRemoveFromCart = (code: string) => {
    setCart((prevCart) => prevCart.filter(item => item.CODE !== code));
  };

  // ========== (6) 購入リスト: 数量変更 (1～99) ==========
  const handleChangeQuantity = (code: string) => {
    // ユーザーに新しい数量を入力させる例: window.prompt (シンプル実装)
    const newQtyStr = window.prompt("数量を入力 (1～99)", "1");
    if (!newQtyStr) return; // キャンセルや空入力
    const newQty = parseInt(newQtyStr, 10);
    if (Number.isNaN(newQty) || newQty < 1 || newQty > 99) {
      alert("数量は1～99の範囲で入力してください。");
      return;
    }

    setCart((prevCart) => {
      return prevCart.map((item) => {
        if (item.CODE === code) {
          return { ...item, quantity: newQty };
        } else {
          return item;
        }
      });
    });
  };

  // ========== (7) 購入確定 ==========
  const handlePurchase = async () => {
    if (!transactionId) return;
    try {
      const res = await fetch(`${backendUrl}/api/transactions/${transactionId}`);
      if (!res.ok) {
        alert('取引情報の取得に失敗しました');
        return;
      }
      const data: Transaction = await res.json();
      const totalTaxIncluded = Math.round(data.TOTAL_AMT * 1.1);
      alert(`購入が完了しました！\n合計金額（税込）: ${totalTaxIncluded} 円`);

      // カートをクリア
      setCart([]);
      setProductCode('');
      setFoundProduct(null);
      setProductError('');
    } catch (error) {
      console.error('購入エラー:', error);
    }
  };

  // 合計金額(税抜) (フロント側で表示用)
  const totalWithoutTax = cart.reduce((sum, item) => sum + item.PRICE * item.quantity, 0);

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Web画面POSアプリ</h1>

      {/* スキャン開始/停止 ボタン */}
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

      {/* 手入力エリア + 読み込みボタン */}
      <div style={{ marginBottom: '8px' }}>
        <input
          type="text"
          placeholder="商品コードを入力"
          value={productCode}
          onChange={(e) => setProductCode(e.target.value)}
          style={{ width: '200px', marginRight: '8px' }}
        />
        <button onClick={handleManualRead}>
          商品コード 読み込み
        </button>
      </div>

      {/* 名称／単価表示 */}
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
            <p style={{ color: 'blue' }}>自動的に購入リストに追加しました</p>
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

                  {/* リストから削除 */}
                  <button
                    style={{ marginLeft: '8px' }}
                    onClick={() => handleRemoveFromCart(item.CODE)}
                  >
                    リストから削除
                  </button>

                  {/* 数量変更 */}
                  <button
                    style={{ marginLeft: '8px' }}
                    onClick={() => handleChangeQuantity(item.CODE)}
                  >
                    数量変更
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p style={{ marginTop: '8px' }}>合計金額(税抜): {totalWithoutTax}円</p>
      </div>

      {/* 購入ボタン */}
      <button onClick={handlePurchase} style={{ fontSize: '1.1em', padding: '6px 16px' }}>
        購入
      </button>
    </div>
  );
}
