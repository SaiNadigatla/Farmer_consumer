document.addEventListener('DOMContentLoaded', () => {
  const paymentForm = document.getElementById('payment-form');
  const errorMessage = document.getElementById('error-message');

  paymentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMessage.style.display = 'none';

    // Basic validation to ensure fields are not empty
    const cardName = document.getElementById('card-name').value;
    const cardNumber = document.getElementById('card-number').value;
    const expiryDate = document.getElementById('expiry-date').value;
    const cvv = document.getElementById('cvv').value;

    if (!cardName || !cardNumber || !expiryDate || !cvv) {
      errorMessage.textContent = 'All fields are required.';
      errorMessage.style.display = 'block';
      return;
    }

    // Retrieve cart and user info from sessionStorage
    const userId = sessionStorage.getItem('userId');
    const cart = JSON.parse(sessionStorage.getItem('cartForPayment'));

    if (!userId || !cart) {
      errorMessage.textContent = 'Could not find cart data. Please return to your cart and try again.';
      errorMessage.style.display = 'block';
      return;
    }

    const items = cart.map(item => ({
      cropId: item.id, // Assuming the cart item has an 'id' for the crop
      qty: item.quantity,
    }));

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: Number(userId), items }),
      });

      if (!response.ok) {
        let errorMsg = 'Payment failed. Please try again.';
        try {
            const result = await response.json();
            errorMsg = result.message || errorMsg;
        } catch (e) {
            // Response was not JSON.
        }
        throw new Error(errorMsg);
      }

      const result = await response.json();
      alert('Payment Successful! Your order has been placed. Order ID: ' + result.orderId);
      
      sessionStorage.removeItem('cartForPayment');
      window.location.href = 'index.html';

    } catch (error) {
      errorMessage.textContent = error.message;
      errorMessage.style.display = 'block';
    }
  });
});
