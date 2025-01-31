// src/pages/index.tsx
import { useEffect, useState } from 'react';

// 商品マスタ用の型 (バックエンドのAPIに合わせて調整)
interface Product {
  PRD_ID: number;
  CODE: string;
  NAME: string;
  PRICE: number;
}

// 取引テーブル (レスポンス例)
interface Transaction {
  TRD_ID: number;
  DATETIME: string;
  EMP_CD: string;
  STORE_CD: string;
  POS_NO: string;
  TOTAL_AMT: number;
}

// カート表示用の型 (名称, 単価, 合計(＝単価×数量)など)
interface CartItem {
  CODE: string;
  NAME: string;
  PRICE: number;
  quantity: number;  // 今回は1で固定、再スキャンで行追加
}

export default function HomePage() {
  // バックエンドAPIのURLを.env.localから取得
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'https://tech0-gen8-step4-pos-app-40.azurewebsites.net';

  // 取引ID（最初に取引を作成して取得しておく）
  const [transactionId, setTransactionId] = useState<number | null>(null);

  // ①商品コード入力
  const [productCode, setProductCode] = useState('');
  // ②読み込みボタン押下後に取得する商品情報
  const [foundProduct, setFoundProduct] = useState<Product | null>(null);
  // 商品が存在しなかった場合のメッセージ ("商品がマスタ未登録です")
  const [productError, setProductError] = useState('');

  // ⑥購入品リスト（カート）
  const [cart, setCart] = useState<CartItem[]>([]);

  // ========== 初回マウント時に「新規取引」を作成 ==========
  useEffect(() => {
    async function createNewTransaction() {
      try {
        const now = new Date().toISOString();
        // バックエンドへPOST (必要に応じてEMP_CD, STORE_CDなどを送る)
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
    }
    createNewTransaction();
  }, [backendUrl]);

  // ========== ①「商品コード 読み込み」ボタン押下時 ==========
  const handleReadCode = async () => {
    if (!productCode) return; // 入力が空なら処理しない

    setFoundProduct(null);
    setProductError('');

    try {
      // GET /api/products-by-code/{code} のエンドポイントを想定
      const res = await fetch(`${backendUrl}/api/products-by-code/${productCode}`);
      if (res.status === 404) {
        // 見つからない場合
        setFoundProduct(null);
        setProductError('商品がマスタ未登録です');
        return;
      }
      if (!res.ok) {
        alert('商品検索に失敗しました');
        return;
      }
      const data: Product = await res.json();
      setFoundProduct(data);
      setProductError('');
    } catch (error) {
      console.error('商品コード読み込みエラー:', error);
      alert('読み込みに失敗しました');
    }
  };

  // ========== ⑤「購入リストへ追加」ボタン押下時 ==========
  const handleAddToCart = async () => {
    if (!transactionId) {
      alert('取引IDが取得できていません');
      return;
    }
    if (!foundProduct) {
      alert('商品が読み込まれていません');
      return;
    }

    try {
      // 取引明細追加API
      // DTL_IDはとりあえず cart.length+1 を割り当てる例
      const detailBody = {
        DTL_ID: cart.length + 1,
        PRD_ID: foundProduct.PRD_ID,
        PRD_CODE: foundProduct.CODE,
        PRD_NAME: foundProduct.NAME,
        PRD_PRICE: foundProduct.PRICE,
      };
      const res = await fetch(`${backendUrl}/api/transactions/${transactionId}/details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(detailBody),
      });
      if (!res.ok) {
        alert('購入リストへの追加に失敗しました');
        return;
      }

      // カートに1行追加 (数量は1で固定)
      const newItem: CartItem = {
        CODE: foundProduct.CODE,
        NAME: foundProduct.NAME,
        PRICE: foundProduct.PRICE,
        quantity: 1,
      };
      setCart((prev) => [...prev, newItem]);

      // フォームリセット
      setProductCode('');
      setFoundProduct(null);
      setProductError('');
    } catch (error) {
      console.error('購入リスト追加エラー:', error);
      alert('購入リスト追加でエラーが発生しました');
    }
  };

  // ========== ⑦「購入」ボタン押下時（合計金額を確認・表示） ==========
  const handlePurchase = async () => {
    if (!transactionId) return;
    try {
      // バックエンドで合計金額を再取得
      const res = await fetch(`${backendUrl}/api/transactions/${transactionId}`);
      if (!res.ok) {
        alert('取引情報の取得に失敗しました');
        return;
      }
      const data: Transaction = await res.json();
      // 税込計算 (例: 10% 加算)
      const totalTaxIncluded = Math.round(data.TOTAL_AMT * 1.1);
      alert(`購入が完了しました！\n合計金額（税込）: ${totalTaxIncluded} 円`);

      // カートをクリア & コード入力欄もリセット
      setCart([]);
      setProductCode('');
      setFoundProduct(null);
      setProductError('');

      // 必要に応じて新しい取引IDを再作成してもOK
      // ...
    } catch (error) {
      console.error('購入エラー:', error);
    }
  };

  // ========== 合計金額(税抜)をフロント側でも計算して表示したい場合 ==========
  const totalWithoutTax = cart.reduce((sum, item) => sum + item.PRICE * item.quantity, 0);

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Web画面POSアプリ</h1>

      {/* ②コード入力エリア */}
      <div style={{ marginBottom: '8px' }}>
        <input
          type="text"
          placeholder="商品コードを入力"
          value={productCode}
          onChange={(e) => setProductCode(e.target.value)}
          style={{ width: '200px', marginRight: '8px' }}
        />
        {/* ①読み込みボタン */}
        <button onClick={handleReadCode}>商品コード 読み込み</button>
      </div>

      {/* ③名称表示エリア / ④単価表示エリア */}
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
          </>
        ) : (
          <p style={{ color: '#666' }}>名称／単価がここに表示されます</p>
        )}
      </div>

      {/* ⑤購入リストへ追加ボタン */}
      <button onClick={handleAddToCart} style={{ marginBottom: '16px' }}>
        追加
      </button>

      {/* ⑥購入品リスト */}
      <div style={{ border: '1px solid #ccc', padding: '10px', marginBottom: '8px' }}>
        <h3>購入リスト</h3>
        {cart.length === 0 ? (
          <p>リストが空です</p>
        ) : (
          <ul>
            {cart.map((item, idx) => {
              const lineTotal = item.PRICE * item.quantity;
              return (
                <li key={idx}>
                  {item.NAME} × {item.quantity}　{item.PRICE}円　{lineTotal}円
                </li>
              );
            })}
          </ul>
        )}
        <p style={{ marginTop: '8px' }}>合計金額(税抜): {totalWithoutTax}円</p>
      </div>

      {/* ⑦購入ボタン */}
      <button onClick={handlePurchase} style={{ fontSize: '1.1em', padding: '6px 16px' }}>
        購入
      </button>
    </div>
  );
}
