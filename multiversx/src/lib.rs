#![no_std]

use multiversx_sc::api::KECCAK256_RESULT_LEN;
use multiversx_sc::derive::type_abi;

multiversx_sc::imports!();
multiversx_sc::derive_imports!();

#[type_abi]
#[derive(TopEncode, TopDecode, NestedEncode, NestedDecode, PartialEq)]
enum TokenType {
    LockUnlock,
    MintBurn,
}

#[type_abi]
#[derive(TopEncode, TopDecode, NestedEncode, NestedDecode)]
struct KnownToken<M: ManagedTypeApi> {
    token_identifier: EgldOrEsdtTokenIdentifier<M>,
    token_type: TokenType,
}

mod gateway_proxy {
    use multiversx_sc::api::KECCAK256_RESULT_LEN;

    multiversx_sc::imports!();

    #[multiversx_sc::proxy]
    pub trait Gateway {
        #[endpoint(callContract)]
        fn call_contract(
            &self,
            destination_chain: ManagedBuffer,
            destination_contract_address: ManagedBuffer,
            payload: ManagedBuffer,
        );

        #[endpoint(validateMessage)]
        fn validate_message(
            &self,
            source_chain: &ManagedBuffer,
            message_id: &ManagedBuffer,
            source_address: &ManagedBuffer,
            payload_hash: &ManagedByteArray<KECCAK256_RESULT_LEN>,
        ) -> bool;
    }
}

#[multiversx_sc::contract]
pub trait Donate {
    #[init]
    fn init(&self, gateway: ManagedAddress) {
        self.gateway().set(gateway);
    }

    #[upgrade]
    fn upgrade(&self) {}

    #[only_owner]
    #[endpoint(addKnownToken)]
    fn add_known_token(
        &self,
        token_id: ManagedByteArray<KECCAK256_RESULT_LEN>,
        token_identifier: EgldOrEsdtTokenIdentifier,
        token_type: TokenType,
    ) {
        self.known_tokens(&token_id).set(KnownToken {
            token_identifier,
            token_type,
        });
    }

    #[only_owner]
    #[endpoint(removeKnownToken)]
    fn remove_known_token(&self, token_id: ManagedByteArray<KECCAK256_RESULT_LEN>) {
        self.known_tokens(&token_id).clear();
    }

    #[only_owner]
    #[endpoint(addKnownChain)]
    fn add_known_chain(&self, chain_name: ManagedBuffer, chain_address: ManagedBuffer) {
        self.known_chains_addresses(&chain_name).set(&chain_address);
        self.known_chains_names(&chain_address).set(&chain_name);
    }

    #[only_owner]
    #[endpoint(removeKnownChain)]
    fn remove_known_chain(&self, chain_name: ManagedBuffer) {
        let chain_address = self.known_chains_addresses(&chain_name).take();

        self.known_chains_names(&chain_address).clear();
    }

    #[payable("*")]
    #[endpoint(sendToken)]
    fn send_token(
        &self,
        destination_chain: ManagedBuffer,
        token_id: ManagedByteArray<KECCAK256_RESULT_LEN>,
        receiver_address: ManagedBuffer,
    ) {
        let (token_identifier, amount) = self.call_value().egld_or_single_fungible_esdt();

        require!(
            !self.known_chains_addresses(&destination_chain).is_empty(),
            "Unknown chain"
        );

        let destination_address = self.known_chains_addresses(&destination_chain).get();

        let known_token = self.check_known_token(&token_id, &amount);

        require!(
            known_token.token_identifier == token_identifier,
            "Invalid token sent"
        );

        if known_token.token_type == TokenType::MintBurn && token_identifier.is_esdt() {
            self.send()
                .esdt_local_burn(&token_identifier.into_esdt_option().unwrap(), 0, &amount);
        }

        let mut payload = ManagedBuffer::new();
        payload.append(&token_id.as_managed_buffer());
        payload.append(&self.pad_biguint(&amount).as_managed_buffer());
        payload.append(&receiver_address);

        self.token_sent_event(
            &self.blockchain().get_caller(),
            &destination_chain,
            &receiver_address,
            &token_id,
            &known_token.token_identifier,
            &amount,
        );

        self.gateway_proxy(self.gateway().get())
            .call_contract(destination_chain, destination_address, payload)
            .execute_on_dest_context::<()>();
    }

    #[endpoint]
    fn execute(
        &self,
        source_chain: ManagedBuffer,
        message_id: ManagedBuffer,
        source_address: ManagedBuffer,
        payload: ManagedBuffer,
    ) {
        require!(
            !self.known_chains_names(&source_address).is_empty(),
            "Unknown chain"
        );

        let payload_hash = self.crypto().keccak256(&payload);

        let valid = self.gateway_proxy(self.gateway().get())
            .validate_message(&source_chain, &message_id, &source_address, &payload_hash)
            .execute_on_dest_context::<bool>();

        require!(valid, "Not validated by gateway");

        let mut slice = [0u8; 32];

        payload.load_slice(0, &mut slice).unwrap_or_else(|_| sc_panic!("Invalid token id"));
        let token_id = ManagedByteArray::<Self::Api, 32>::from(&slice);

        payload.load_slice(32, &mut slice).unwrap_or_else(|_| sc_panic!("Invalid amount"));
        let amount = BigUint::from_bytes_be(&slice);

        // MultiversX addresses will need to be encoded as 32 long hex public key, not bech32
        payload.load_slice(64, &mut slice).unwrap_or_else(|_| sc_panic!("Invalid address"));
        let receiver = ManagedAddress::new_from_bytes(&slice);

        let known_token = self.check_known_token(&token_id, &amount);

        if known_token.token_type == TokenType::MintBurn && known_token.token_identifier.is_esdt() {
            self.send().esdt_local_mint(
                &known_token
                    .token_identifier
                    .clone()
                    .into_esdt_option()
                    .unwrap(),
                0,
                &amount,
            );
        }

        self.token_received_event(
            &receiver,
            &source_chain,
            &token_id,
            &known_token.token_identifier,
            &amount,
        );

        self.send()
            .direct(&receiver, &known_token.token_identifier, 0, &amount);
    }

    fn check_known_token(
        &self,
        token_id: &ManagedByteArray<KECCAK256_RESULT_LEN>,
        amount: &BigUint,
    ) -> KnownToken<Self::Api> {
        require!(!self.known_tokens(token_id).is_empty(), "Unknown token");

        let known_token = self.known_tokens(token_id).get();

        require!(amount > &BigUint::from(0u64), "Invalid amount");

        known_token
    }

    fn pad_biguint(&self, value: &BigUint) -> ManagedByteArray<32> {
        let bytes = value.to_bytes_be_buffer();

        // EVM only supports 32 bytes long (uint256) numbers, so we need this check here to
        // ensure compatibility. Most tokens on MultiversX have 18 decimal, the same as on EVM,
        // so this shouldn't cause any issues, only with extreme outlier tokens that have an
        // unfathomably large supply
        if bytes.len() > 32 {
            panic!("Unsupported number size");
        }

        let start_from = 32 - bytes.len();

        let mut buffer = [0u8; 32];
        let loaded_slice = &mut buffer[0..bytes.len()];
        let _ = bytes.load_slice(0, loaded_slice);

        let mut padded = [0u8; 32];
        padded[start_from..32].copy_from_slice(loaded_slice);

        (&padded).into()
    }

    #[view]
    #[storage_mapper("gateway")]
    fn gateway(&self) -> SingleValueMapper<ManagedAddress>;

    #[view]
    #[storage_mapper("known_tokens")]
    fn known_tokens(
        &self,
        token_id: &ManagedByteArray<KECCAK256_RESULT_LEN>,
    ) -> SingleValueMapper<KnownToken<Self::Api>>;

    #[view]
    #[storage_mapper("known_chains_addresses")]
    fn known_chains_addresses(
        &self,
        chain_name: &ManagedBuffer,
    ) -> SingleValueMapper<ManagedBuffer>;

    #[view]
    #[storage_mapper("known_chains_names")]
    fn known_chains_names(&self, chain_address: &ManagedBuffer)
        -> SingleValueMapper<ManagedBuffer>;

    #[event("token_sent_event")]
    fn token_sent_event(
        &self,
        #[indexed] sender: &ManagedAddress,
        #[indexed] destination_chain: &ManagedBuffer,
        #[indexed] receiver_address: &ManagedBuffer,
        #[indexed] token_id: &ManagedByteArray<KECCAK256_RESULT_LEN>,
        #[indexed] token: &EgldOrEsdtTokenIdentifier,
        amount: &BigUint,
    );

    #[event("token_received_event")]
    fn token_received_event(
        &self,
        #[indexed] receiver: &ManagedAddress,
        #[indexed] source_chain: &ManagedBuffer,
        #[indexed] token_id: &ManagedByteArray<KECCAK256_RESULT_LEN>,
        #[indexed] token: &EgldOrEsdtTokenIdentifier,
        amount: &BigUint,
    );

    #[proxy]
    fn gateway_proxy(&self, sc_address: ManagedAddress) -> gateway_proxy::Proxy<Self::Api>;
}
