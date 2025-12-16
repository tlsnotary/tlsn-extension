TLSNotary is a zkTLS protocol that allows a prover to prove web data from a web server to a third-party verifier. In most zkTLS use cases, a web app wants to provide an end user with a service that requires verifiable private user data.

In this tutorial, you will learn how to build a small website that provides visitors a way to prove their bank balance to a verifier backend. This will give you cryptographic guarantees of the bank balance of the user/prover. In this tutorial, we will write a plugin for the TLSNotary browser extension to prove the balance of the user on their Swiss bank. The extension will run this plugin and ensure the user is protected while providing you an easy way to verify the proven data. You will also run a verifier server that verifies user proofs. Note that in this tutorial we will not do post-processing of the proven data. In a real-world scenario, you would of course check the bank balance and verify it meets the requirements for whatever next step your application needs.

Prerequisites:
* npm
* cargo (Rust)
* Clone this repository
* Google Chrome browser

1. Install the TLSNotary extension
    TODO: add extension URL
2. Launch the verifier
```
cd verifier
cargo run --release
```
3. ~~Test the Twitter example → prove screen name~~
4. Try to access the bank balance without logging in: https://swissbank.tlsnotary.org/balances → you should get an error
5. Log in to the bank: https://swissbank.tlsnotary.org/login
   1. Username: "tkstanczak"
   2. Password: "TLSNotary is my favorite project"
6. Modify the Twitter plugin to get the balance information instead:
   1. Modify all URLs
   2. Modify the information that will be revealed (the "CHF" balance)
7. Run the plugin

# Extra challenge: "Fool the verifier"

So far we have focused on the prover only. Verification is of course also extremely important. You always have to carefully verify the data you receive from users. Even if it is cryptographically proven with TLSNotary, you still have to verify the data correctly, or you can be fooled.

In this extra challenge, you should examine how the verifier checks the balance and modify the prover to make the verifier believe you have more CHF in your bank account than you actually do.

Hint
* Look how naive the check is for "swissbank.tlsnotary.org" in `packages/verifier/main.rs`
* Manipulate the existing regex in the prover and add an extra entry to prove a different number


<TODO: Screenshot CHF 275_000_000>


FAQ:
Browser only? For now, yes. In a few months, you will be able to run the plugins on mobile too. #pinkypromise