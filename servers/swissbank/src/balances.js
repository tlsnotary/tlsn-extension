(function () {
    function formatAmount(amountStr) {
        // Remove underscores from the JSON
        const clean = amountStr.replace(/_/g, '');

        // Parse as number and format with commas using toLocaleString
        const num = parseInt(clean, 10);
        if (isNaN(num)) return clean;
        return num.toLocaleString();
    }

    function showError(message) {
        const errorDiv = document.getElementById('error-message');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        document.getElementById('loading-message').style.display = 'none';
    }

    function loadBalances() {
        fetch('/balances')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to fetch balances: ' + response.status);
                }
                return response.json();
            })
            .then(data => {

                // Update organization name
                const orgElement = document.getElementById('org-name');
                orgElement.textContent = data.organization || 'Unknown';

                // Hide loading message
                document.getElementById('loading-message').style.display = 'none';

                // Show accounts
                const accountsContainer = document.getElementById('accounts-container');
                accountsContainer.innerHTML = '';

                if (data.accounts) {
                    Object.entries(data.accounts).forEach(([currency, amount]) => {
                        const balanceItem = document.createElement('div');
                        balanceItem.className = 'balance-item';

                        const currencyDiv = document.createElement('div');
                        currencyDiv.className = 'currency';
                        currencyDiv.textContent = currency;

                        const amountDiv = document.createElement('div');
                        amountDiv.className = 'amount';
                        amountDiv.textContent = formatAmount(amount);

                        balanceItem.appendChild(currencyDiv);
                        balanceItem.appendChild(amountDiv);
                        accountsContainer.appendChild(balanceItem);
                    });
                    accountsContainer.style.display = 'block';
                } else {
                    showError('No account data found');
                }
            })
            .catch(error => {
                console.error('Error loading balances:', error);
                showError('Failed to load account balances. Please try refreshing the page.');
            });
    }

    // Load balances when page loads
    document.addEventListener('DOMContentLoaded', loadBalances);
})();