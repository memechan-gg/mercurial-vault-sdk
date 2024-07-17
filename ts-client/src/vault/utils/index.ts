import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  unpackAccount,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createCloseAccountInstruction,
} from '@solana/spl-token';
import {
  AccountInfo,
  Connection,
  ParsedAccountData,
  PublicKey,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  TransactionInstruction,
} from '@solana/web3.js';
import { Account, AccountLayout } from '@solana/spl-token';
import { BN } from '@coral-xyz/anchor';

import { SEEDS, VAULT_BASE_KEY } from '../constants';
import { ParsedClockState, VaultProgram } from '../types';

export const getAssociatedTokenAccount = async (tokenMint: PublicKey, owner: PublicKey) => {
  return await getAssociatedTokenAddress(tokenMint, owner, true);
};

export const deserializeAccount = (data: AccountInfo<Buffer> | undefined): Account | undefined => {
  if (!data) {
    return undefined;
  }
  return unpackAccount(data.owner, data);
};

export const getOrCreateATAInstruction = async (
  tokenMint: PublicKey,
  owner: PublicKey,
  connection: Connection,
  opt?: {
    payer?: PublicKey;
  },
): Promise<[PublicKey, TransactionInstruction?]> => {
  let toAccount;
  try {
    toAccount = await getAssociatedTokenAddress(tokenMint, owner, true);
    const account = await connection.getAccountInfo(toAccount);
    if (!account) {
      const ix = createAssociatedTokenAccountInstruction(opt?.payer || owner, toAccount, owner, tokenMint);
      return [toAccount, ix];
    }
    return [toAccount, undefined];
  } catch (e) {
    /* handle error */
    console.error('Error::getOrCreateATAInstruction', e);
    throw e;
  }
};

export const getVaultPdas = (tokenMint: PublicKey, programId: PublicKey, seedBaseKey?: PublicKey) => {
  const [vault, _vaultBump] = PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.VAULT_PREFIX), tokenMint.toBuffer(), (seedBaseKey ?? VAULT_BASE_KEY).toBuffer()],
    programId,
  );

  const tokenVault = PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.TOKEN_VAULT_PREFIX), vault.toBuffer()],
    programId,
  );
  const lpMint = PublicKey.findProgramAddressSync([Buffer.from(SEEDS.LP_MINT_PREFIX), vault.toBuffer()], programId);

  return {
    vaultPda: vault,
    tokenVaultPda: tokenVault[0],
    lpMintPda: lpMint[0],
  };
};

export const wrapSOLInstruction = (from: PublicKey, to: PublicKey, amount: BN): TransactionInstruction[] => {
  return [
    SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: to,
      lamports: amount.toNumber(),
    }),
    new TransactionInstruction({
      keys: [
        {
          pubkey: to,
          isSigner: false,
          isWritable: true,
        },
      ],
      data: Buffer.from(new Uint8Array([17])),
      programId: TOKEN_PROGRAM_ID,
    }),
  ];
};

export const unwrapSOLInstruction = async (walletPublicKey: PublicKey) => {
  const wSolATAAccount = await getAssociatedTokenAddress(NATIVE_MINT, walletPublicKey, true);

  if (wSolATAAccount) {
    const closedWrappedSolInstruction = createCloseAccountInstruction(wSolATAAccount, walletPublicKey, walletPublicKey);
    return closedWrappedSolInstruction;
  }
  return null;
};

export const getOnchainTime = async (connection: Connection) => {
  const parsedClock = await connection.getParsedAccountInfo(SYSVAR_CLOCK_PUBKEY);

  const parsedClockAccount = (parsedClock.value!.data as ParsedAccountData).parsed as ParsedClockState;

  const currentTime = parsedClockAccount.info.unixTimestamp;
  return currentTime;
};

export const getLpSupply = async (connection: Connection, tokenMint: PublicKey): Promise<BN> => {
  const context = await connection.getTokenSupply(tokenMint);
  return new BN(context.value.amount);
};

export function chunks<T>(array: T[], size: number): T[][] {
  return Array.apply(0, new Array(Math.ceil(array.length / size))).map((_, index) =>
    array.slice(index * size, (index + 1) * size),
  );
}

export async function chunkedFetchMultipleVaultAccount(
  program: VaultProgram,
  pks: PublicKey[],
  chunkSize: number = 100,
) {
  const accounts = (
    await Promise.all(chunks(pks, chunkSize).map((chunk) => program.account.vault.fetchMultiple(chunk)))
  ).flat();

  return accounts.filter(Boolean);
}

export async function chunkedGetMultipleAccountInfos(
  connection: Connection,
  pks: PublicKey[],
  chunkSize: number = 100,
) {
  const accountInfos = (
    await Promise.all(chunks(pks, chunkSize).map((chunk) => connection.getMultipleAccountsInfo(chunk)))
  ).flat();

  return accountInfos;
}
