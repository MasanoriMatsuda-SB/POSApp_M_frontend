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

// カートはフロント側のみで管理 (最後に購入ボタンでサーバ送信)
interface CartItem {
  PRD_ID: number;
  CODE: string;
  NAME: string;
  PRICE: number;
  quantity: number;
}

export default function HomePage() {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'https://tech0-gen8-step4-pos-app-40.azurewebsites.net';

  // 取引ID
  const [transactionId, setTransactionId] = useState<number | null>(null);

  // 商品コード (バーコード or 手動入力)
  const [productCode, setProductCode] = useState('');
  // 最後に読み込んだ商品
  const [foundProduct, setFoundProduct] = useState<Product | null>(null);
  // 商品エラー表示用
  const [productError, setProductError] = useState('');

  // カート (フロントのみで数量管理/削除/追加)
  const [cart, setCart] = useState<CartItem[]>([]);

  // バーコードスキャン関連
  const [isScanning, setIsScanning] = useState(false);
  const [scannerControls, setScannerControls] = useState<IScannerControls | null>(null);

  // ========== (1) 新規取引を作成: コンポーネント初期表示時 ==========
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
          console.error('取引作成に失敗:', await res.text());
          return;
        }
        const data: Transaction = await res.json();
        setTransactionId(data.TRD_ID);
        console.log('New transaction ID:', data.TRD_ID);
      } catch (error) {
        console.error('取引作成APIエラー:', error);
      }
    };
    createTransaction();
  }, [backendUrl]);

  // ========== (2) 商品コードから商品情報を取得 (サーバ) + カートに自動追加 (フロントだけ) ==========
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
        console.error('fetchProductByCode error:', await res.text());
        alert('商品検索に失敗しました');
        return;
      }
      const data: Product = await res.json();
      setFoundProduct(data);
      setProductError('');

      // フロントのカートに自動追加(同じCODEなら数量+1)
      autoAddToCart(data);
    } catch (error) {
      console.error('商品コード読み込みエラー:', error);
      alert('読み込みに失敗しました');
    }
  };

  // ========== バーコード/手入力で取得した商品を "フロントカート" に登録 ==========
  const autoAddToCart = (product: Product) => {
    setCart((prevCart) => {
      const index = prevCart.findIndex(item => item.CODE === product.CODE);
      if (index !== -1) {
        // 数量+1
        const updated = [...prevCart];
        updated[index].quantity += 1;
        return updated;
      } else {
        // 新規アイテム追加
        return [...prevCart, {
          PRD_ID: product.PRD_ID,
          CODE: product.CODE,
          NAME: product.NAME,
          PRICE: product.PRICE,
          quantity: 1,
        }];
      }
    });
  };

  // ========== (3) 手動入力の「読み込み」ボタン ==========
  const handleManualRead = () => {
    fetchProductByCode(productCode);
  };

  // ========== (4) バーコードスキャンの開始/停止 ==========
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

  // ========== カメラ起動 & バーコード解析 => fetchProductByCode => カート追加 (フロントだけ) ==========
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

        // 商品検索 => カート追加
        setProductCode(scannedCode);
        fetchProductByCode(scannedCode);
      }
      // error はバーコード未検出で頻繁に呼ばれる => ログ抑制
    })
    .then((controls) => {
      setScannerControls(controls);
    })
    .catch((err) => {
      console.error('Camera access error:', err);
      alert('カメラにアクセスできません。HTTPSでアクセスしているかご確認ください。');
      setIsScanning(false);
    });

    // クリーンアップ (unmount時)
    return () => {
      if (scannerControls) {
        scannerControls.stop();
      }
    };
  }, [isScanning]);

  // ========== (5) 購入リスト上: 削除ボタン (フロントのみ) ==========
  const handleRemoveItem = (code: string) => {
    setCart((prev) => prev.filter(item => item.CODE !== code));
  };

  // ========== (6) 購入リスト上: 数量変更 (1~99, フロントのみ) ==========
  const handleChangeQuantity = (code: string) => {
    const input = window.prompt("数量を入力 (1～99)", "1");
    if (!input) return; // キャンセル
    const newQty = parseInt(input, 10);
    if (Number.isNaN(newQty) || newQty < 1 || newQty > 99) {
      alert("数量は1～99の範囲で指定してください。");
      return;
    }
    setCart((prev) => prev.map(item => {
      if (item.CODE === code) {
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  // ========== (7) 購入ボタン押下 => "購入ボタン時点" のカート内容をサーバに登録 ==========
  const handlePurchase = async () => {
    if (!transactionId) {
      alert("取引IDが設定されていません");
      return;
    }

    // (A) カートの内容を transaction_details_matsuda に反映
    //     => サーバ側が数量カラムを持たないため、1商品につき "quantity" 回POST
    for (const item of cart) {
      // item.quantity 回ループ (在庫カラムがない想定)
      for (let i = 0; i < item.quantity; i++) {
        await registerDetail(item);
      }
    }

    // (B) サーバで合計金額(サーバ側の合計)を取得して表示
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
      console.error("購入確定時のGET失敗:", err);
    }

    // (C) カートをクリア
    setCart([]);
    setProductCode('');
    setFoundProduct(null);
    setProductError('');
  };

  // ========== 明細を1行登録するAPI呼び出し (サーバが quantityカラムを持たない前提で複数POST) ==========
  const registerDetail = async (item: CartItem) => {
    if (!transactionId) return;

    // DTL_ID は一意にする必要がある => ランダム等で代用
    const detailBody = {
      DTL_ID: Math.floor(Math.random() * 1000000),
      PRD_ID: item.PRD_ID,   // DBにPRD_ID必須
      PRD_CODE: item.CODE,
      PRD_NAME: item.NAME,
      PRD_PRICE: item.PRICE
      // 数量カラムがあれば => quantity: item.quantity
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
  };

  // フロント側での合計金額(税抜)計算 (表示用のみ)
  const totalWithoutTax = cart.reduce((sum, item) => sum + item.PRICE * item.quantity, 0);

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>購入ボタン押下時にDBへ登録するPOSアプリ</h1>

      {/* スキャン開始/停止 */}
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

      {/* 手動入力エリア */}
      <div style={{ marginBottom: '8px' }}>
        <input
          type="text"
          placeholder="商品コードを入力"
          value={productCode}
          onChange={(e) => setProductCode(e.target.value)}
          style={{ width: '200px', marginRight: '8px' }}
        />
        <button onClick={() => fetchProductByCode(productCode)}>
          商品コード 読み込み
        </button>
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
              カートに自動追加されました（サーバ未登録、購入ボタンで確定）
            </p>
          </>
        ) : (
          <p style={{ color: '#666' }}>名称／単価がここに表示されます</p>
        )}
      </div>

      {/* 購入リスト */}
      <div style={{ border: '1px solid #ccc', padding: '10px', marginBottom: '8px' }}>
        <h3>購入リスト (フロント管理)</h3>
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
                    onClick={() => handleRemoveItem(item.CODE)}
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

      {/* 購入ボタン => まとめてDB登録 */}
      <button onClick={handlePurchase} style={{ fontSize: '1.1em', padding: '6px 16px' }}>
        購入
      </button>
    </div>
  );
}
