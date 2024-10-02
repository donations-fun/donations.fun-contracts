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

    #[view]
    #[storage_mapper("gateway")]
    fn gateway(&self) -> SingleValueMapper<ManagedAddress>;

    #[proxy]
    fn gateway_proxy(&self, sc_address: ManagedAddress) -> gateway_proxy::Proxy<Self::Api>;
}
