import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { ethers, upgrades } from 'hardhat';
import { expect } from 'chai';
import { deploySuiteWithModularCompliancesFixture } from '../fixtures/deploy-full-suite.fixture';
import { deployComplianceFixture } from '../fixtures/deploy-compliance.fixture';

async function deployTransferRestrictFullSuite() {
  const context = await loadFixture(deploySuiteWithModularCompliancesFixture);
  const module = await ethers.deployContract('TransferRestrictModule');
  const proxy = await ethers.deployContract('ModuleProxy', [module.address, module.interface.encodeFunctionData('initialize')]);
  const complianceModule = await ethers.getContractAt('TransferRestrictModule', proxy.address);

  await context.suite.compliance.bindToken(context.suite.token.address);
  await context.suite.compliance.addModule(complianceModule.address);

  return {
    ...context,
    suite: {
      ...context.suite,
      complianceModule,
    },
  };
}

describe('Compliance Module: TransferRestrict', () => {
  it('should deploy the TransferRestrict contract and bind it to the compliance', async () => {
    const context = await loadFixture(deployTransferRestrictFullSuite);

    expect(context.suite.complianceModule.address).not.to.be.undefined;
    expect(await context.suite.compliance.isModuleBound(context.suite.complianceModule.address)).to.be.true;
  });

  describe('.name', () => {
    it('should return the name of the module', async () => {
      const context = await loadFixture(deployTransferRestrictFullSuite);

      expect(await context.suite.complianceModule.name()).to.be.equal('TransferRestrictModule');
    });
  });

  describe('.isPlugAndPlay', () => {
    it('should return true', async () => {
      const context = await loadFixture(deployTransferRestrictFullSuite);
      expect(await context.suite.complianceModule.isPlugAndPlay()).to.be.true;
    });
  });

  describe('.canComplianceBind', () => {
    it('should return true', async () => {
      const context = await loadFixture(deployTransferRestrictFullSuite);
      const complianceModule = await ethers.deployContract('TransferRestrictModule');
      expect(await complianceModule.canComplianceBind(context.suite.compliance.address)).to.be.true;
    });
  });

  describe('.owner', () => {
    it('should return owner', async () => {
      const context = await loadFixture(deployTransferRestrictFullSuite);
      await expect(context.suite.complianceModule.owner()).to.eventually.be.eq(context.accounts.deployer.address);
    });
  });

  describe('.initialize', () => {
    it('should be called only once', async () => {
      // given
      const {
        accounts: { deployer },
      } = await loadFixture(deployComplianceFixture);
      const module = (await ethers.deployContract('TransferRestrictModule')).connect(deployer);
      await module.initialize();

      // when & then
      await expect(module.initialize()).to.be.revertedWith('Initializable: contract is already initialized');
      expect(await module.owner()).to.be.eq(deployer.address);
    });
  });

  describe('.transferOwnership', () => {
    describe('when calling directly', () => {
      it('should revert', async () => {
        const context = await loadFixture(deployTransferRestrictFullSuite);
        await expect(
          context.suite.complianceModule.connect(context.accounts.aliceWallet).transferOwnership(context.accounts.bobWallet.address),
        ).to.revertedWith('Ownable: caller is not the owner');
      });
    });

    describe('when calling with owner account', () => {
      it('should transfer ownership', async () => {
        // given
        const context = await loadFixture(deployTransferRestrictFullSuite);

        // when
        await context.suite.complianceModule.connect(context.accounts.deployer).transferOwnership(context.accounts.bobWallet.address);

        // then
        const owner = await context.suite.complianceModule.owner();
        expect(owner).to.eq(context.accounts.bobWallet.address);
      });
    });
  });

  describe('.upgradeTo', () => {
    describe('when calling directly', () => {
      it('should revert', async () => {
        const context = await loadFixture(deployTransferRestrictFullSuite);
        await expect(context.suite.complianceModule.connect(context.accounts.aliceWallet).upgradeTo(ethers.constants.AddressZero)).to.revertedWith(
          'Ownable: caller is not the owner',
        );
      });
    });

    describe('when calling with owner account', () => {
      it('should upgrade proxy', async () => {
        // given
        const context = await loadFixture(deployTransferRestrictFullSuite);
        const newImplementation = await ethers.deployContract('TransferRestrictModule');

        // when
        await context.suite.complianceModule.connect(context.accounts.deployer).upgradeTo(newImplementation.address);

        // then
        const implementationAddress = await upgrades.erc1967.getImplementationAddress(context.suite.complianceModule.address);
        expect(implementationAddress).to.eq(newImplementation.address);
      });
    });
  });

  describe('.grantPermissions', () => {
    describe('when calling directly', () => {
      it('should revert', async () => {
        const context = await loadFixture(deployTransferRestrictFullSuite);

        await expect(context.suite.complianceModule.grantPermissions(context.accounts.aliceWallet.address, 0x01)).to.revertedWith(
          'only bound compliance can call',
        );
      });
    });

    describe('when calling via compliance', () => {
      it('should grant permissions and emit PermissionsGranted', async () => {
        const context = await loadFixture(deployTransferRestrictFullSuite);

        const tx = await context.suite.compliance.callModuleFunction(
          new ethers.utils.Interface(['function grantPermissions(address _userAddress, uint8 _permissions)']).encodeFunctionData('grantPermissions', [
            context.accounts.aliceWallet.address,
            0x07, // PERM_CAN_RECEIVE_FROM_ACCOUNT | PERM_CAN_RECEIVE_MINT | PERM_CAN_SEND
          ]),
          context.suite.complianceModule.address,
        );

        await expect(tx)
          .to.emit(context.suite.complianceModule, 'PermissionsGranted')
          .withArgs(context.suite.compliance.address, context.accounts.aliceWallet.address, 0x07);
      });
    });
  });

  describe('.revokePermissions', () => {
    describe('when calling directly', () => {
      it('should revert', async () => {
        const context = await loadFixture(deployTransferRestrictFullSuite);

        await expect(context.suite.complianceModule.revokePermissions(context.accounts.aliceWallet.address, 0x01)).to.revertedWith(
          'only bound compliance can call',
        );
      });
    });

    describe('when calling via compliance', () => {
      it('should revoke permissions and emit PermissionsRevoked', async () => {
        const context = await loadFixture(deployTransferRestrictFullSuite);

        // First grant all permissions
        await context.suite.compliance.callModuleFunction(
          new ethers.utils.Interface(['function grantPermissions(address _userAddress, uint8 _permissions)']).encodeFunctionData('grantPermissions', [
            context.accounts.aliceWallet.address,
            0x07,
          ]),
          context.suite.complianceModule.address,
        );

        // Then revoke PERM_CAN_SEND
        const tx = await context.suite.compliance.callModuleFunction(
          new ethers.utils.Interface(['function revokePermissions(address _userAddress, uint8 _permissions)']).encodeFunctionData(
            'revokePermissions',
            [
              context.accounts.aliceWallet.address,
              0x04, // PERM_CAN_SEND
            ],
          ),
          context.suite.complianceModule.address,
        );

        await expect(tx)
          .to.emit(context.suite.complianceModule, 'PermissionsRevoked')
          .withArgs(context.suite.compliance.address, context.accounts.aliceWallet.address, 0x04);

        // Verify remaining permissions = 0x03
        const perms = await context.suite.complianceModule.getUserPermissions(context.suite.compliance.address, context.accounts.aliceWallet.address);
        expect(perms).to.eq(0x03);
      });
    });
  });

  describe('.batchGrantPermissions', () => {
    describe('when calling directly', () => {
      it('should revert', async () => {
        const context = await loadFixture(deployTransferRestrictFullSuite);

        await expect(context.suite.complianceModule.batchGrantPermissions([context.accounts.aliceWallet.address], 0x01)).to.revertedWith(
          'only bound compliance can call',
        );
      });
    });

    describe('when calling via compliance', () => {
      it('should grant permissions to multiple users and emit PermissionsGranted for each', async () => {
        const context = await loadFixture(deployTransferRestrictFullSuite);

        const tx = await context.suite.compliance.callModuleFunction(
          new ethers.utils.Interface(['function batchGrantPermissions(address[] _userAddresses, uint8 _permissions)']).encodeFunctionData(
            'batchGrantPermissions',
            [[context.accounts.aliceWallet.address, context.accounts.bobWallet.address], 0x05], // PERM_CAN_RECEIVE_FROM_ACCOUNT | PERM_CAN_SEND
          ),
          context.suite.complianceModule.address,
        );

        await expect(tx)
          .to.emit(context.suite.complianceModule, 'PermissionsGranted')
          .withArgs(context.suite.compliance.address, context.accounts.aliceWallet.address, 0x05)
          .to.emit(context.suite.complianceModule, 'PermissionsGranted')
          .withArgs(context.suite.compliance.address, context.accounts.bobWallet.address, 0x05);
      });
    });
  });

  describe('.batchRevokePermissions', () => {
    describe('when calling directly', () => {
      it('should revert', async () => {
        const context = await loadFixture(deployTransferRestrictFullSuite);

        await expect(context.suite.complianceModule.batchRevokePermissions([context.accounts.aliceWallet.address], 0x01)).to.revertedWith(
          'only bound compliance can call',
        );
      });
    });

    describe('when calling via compliance', () => {
      it('should revoke permissions from multiple users and emit PermissionsRevoked for each', async () => {
        const context = await loadFixture(deployTransferRestrictFullSuite);

        // Grant first
        await context.suite.compliance.callModuleFunction(
          new ethers.utils.Interface(['function batchGrantPermissions(address[] _userAddresses, uint8 _permissions)']).encodeFunctionData(
            'batchGrantPermissions',
            [[context.accounts.aliceWallet.address, context.accounts.bobWallet.address], 0x07],
          ),
          context.suite.complianceModule.address,
        );

        // Then revoke
        const tx = await context.suite.compliance.callModuleFunction(
          new ethers.utils.Interface(['function batchRevokePermissions(address[] _userAddresses, uint8 _permissions)']).encodeFunctionData(
            'batchRevokePermissions',
            [[context.accounts.aliceWallet.address, context.accounts.bobWallet.address], 0x04], // revoke PERM_CAN_SEND
          ),
          context.suite.complianceModule.address,
        );

        await expect(tx)
          .to.emit(context.suite.complianceModule, 'PermissionsRevoked')
          .withArgs(context.suite.compliance.address, context.accounts.aliceWallet.address, 0x04)
          .to.emit(context.suite.complianceModule, 'PermissionsRevoked')
          .withArgs(context.suite.compliance.address, context.accounts.bobWallet.address, 0x04);
      });
    });
  });

  describe('.getUserPermissions', () => {
    describe('when no permissions have been granted', () => {
      it('should return 0', async () => {
        const context = await loadFixture(deployTransferRestrictFullSuite);
        const perms = await context.suite.complianceModule.getUserPermissions(context.suite.compliance.address, context.accounts.aliceWallet.address);
        expect(perms).to.eq(0);
      });
    });

    describe('when permissions have been granted', () => {
      it('should return the correct bitmask', async () => {
        const context = await loadFixture(deployTransferRestrictFullSuite);

        await context.suite.compliance.callModuleFunction(
          new ethers.utils.Interface(['function grantPermissions(address _userAddress, uint8 _permissions)']).encodeFunctionData('grantPermissions', [
            context.accounts.aliceWallet.address,
            0x03, // PERM_CAN_RECEIVE_FROM_ACCOUNT | PERM_CAN_RECEIVE_MINT
          ]),
          context.suite.complianceModule.address,
        );

        const perms = await context.suite.complianceModule.getUserPermissions(context.suite.compliance.address, context.accounts.aliceWallet.address);
        expect(perms).to.eq(0x03);
      });
    });
  });

  describe('.hasPermission', () => {
    describe('when user has the queried permission', () => {
      it('should return true', async () => {
        const context = await loadFixture(deployTransferRestrictFullSuite);

        await context.suite.compliance.callModuleFunction(
          new ethers.utils.Interface(['function grantPermissions(address _userAddress, uint8 _permissions)']).encodeFunctionData('grantPermissions', [
            context.accounts.aliceWallet.address,
            0x07,
          ]),
          context.suite.complianceModule.address,
        );

        expect(await context.suite.complianceModule.hasPermission(context.suite.compliance.address, context.accounts.aliceWallet.address, 0x01)).to.be
          .true;
        expect(await context.suite.complianceModule.hasPermission(context.suite.compliance.address, context.accounts.aliceWallet.address, 0x02)).to.be
          .true;
        expect(await context.suite.complianceModule.hasPermission(context.suite.compliance.address, context.accounts.aliceWallet.address, 0x04)).to.be
          .true;
      });
    });

    describe('when user does not have the queried permission', () => {
      it('should return false', async () => {
        const context = await loadFixture(deployTransferRestrictFullSuite);

        expect(await context.suite.complianceModule.hasPermission(context.suite.compliance.address, context.accounts.aliceWallet.address, 0x01)).to.be
          .false;
      });
    });
  });

  describe('.moduleCheck', () => {
    describe('when _to is the zero address (burn)', () => {
      it('should return true regardless of permissions', async () => {
        const context = await loadFixture(deployTransferRestrictFullSuite);
        const from = context.accounts.aliceWallet.address;
        const to = ethers.constants.AddressZero;

        // No permissions granted — burns are always allowed
        const result = await context.suite.complianceModule.moduleCheck(from, to, 10, context.suite.compliance.address);
        expect(result).to.be.true;
      });
    });

    describe('when _from is the zero address (mint)', () => {
      describe('when _to has PERM_CAN_RECEIVE_MINT', () => {
        it('should return true', async () => {
          const context = await loadFixture(deployTransferRestrictFullSuite);
          const from = ethers.constants.AddressZero;
          const to = context.accounts.aliceWallet.address;

          await context.suite.compliance.callModuleFunction(
            new ethers.utils.Interface(['function grantPermissions(address _userAddress, uint8 _permissions)']).encodeFunctionData(
              'grantPermissions',
              [to, 0x02], // PERM_CAN_RECEIVE_MINT
            ),
            context.suite.complianceModule.address,
          );

          const result = await context.suite.complianceModule.moduleCheck(from, to, 10, context.suite.compliance.address);
          expect(result).to.be.true;
        });
      });

      describe('when _to does not have PERM_CAN_RECEIVE_MINT', () => {
        it('should return false', async () => {
          const context = await loadFixture(deployTransferRestrictFullSuite);
          const from = ethers.constants.AddressZero;
          const to = context.accounts.aliceWallet.address;

          // Grant only PERM_CAN_RECEIVE_FROM_ACCOUNT (0x01) — not PERM_CAN_RECEIVE_MINT (0x02)
          await context.suite.compliance.callModuleFunction(
            new ethers.utils.Interface(['function grantPermissions(address _userAddress, uint8 _permissions)']).encodeFunctionData(
              'grantPermissions',
              [to, 0x01],
            ),
            context.suite.complianceModule.address,
          );

          const result = await context.suite.complianceModule.moduleCheck(from, to, 10, context.suite.compliance.address);
          expect(result).to.be.false;
        });
      });

      describe('when _to has no permissions at all', () => {
        it('should return false', async () => {
          const context = await loadFixture(deployTransferRestrictFullSuite);
          const from = ethers.constants.AddressZero;
          const to = context.accounts.aliceWallet.address;

          const result = await context.suite.complianceModule.moduleCheck(from, to, 10, context.suite.compliance.address);
          expect(result).to.be.false;
        });
      });
    });

    describe('regular transfer', () => {
      describe('when sender has PERM_CAN_SEND and receiver has PERM_CAN_RECEIVE_FROM_ACCOUNT', () => {
        it('should return true', async () => {
          const context = await loadFixture(deployTransferRestrictFullSuite);
          const from = context.accounts.aliceWallet.address;
          const to = context.accounts.bobWallet.address;

          await context.suite.compliance.callModuleFunction(
            new ethers.utils.Interface(['function grantPermissions(address _userAddress, uint8 _permissions)']).encodeFunctionData(
              'grantPermissions',
              [from, 0x04], // PERM_CAN_SEND
            ),
            context.suite.complianceModule.address,
          );

          await context.suite.compliance.callModuleFunction(
            new ethers.utils.Interface(['function grantPermissions(address _userAddress, uint8 _permissions)']).encodeFunctionData(
              'grantPermissions',
              [to, 0x01], // PERM_CAN_RECEIVE_FROM_ACCOUNT
            ),
            context.suite.complianceModule.address,
          );

          const result = await context.suite.complianceModule.moduleCheck(from, to, 10, context.suite.compliance.address);
          expect(result).to.be.true;
        });
      });

      describe('when sender has PERM_CAN_SEND but receiver lacks PERM_CAN_RECEIVE_FROM_ACCOUNT', () => {
        it('should return false', async () => {
          const context = await loadFixture(deployTransferRestrictFullSuite);
          const from = context.accounts.aliceWallet.address;
          const to = context.accounts.bobWallet.address;

          await context.suite.compliance.callModuleFunction(
            new ethers.utils.Interface(['function grantPermissions(address _userAddress, uint8 _permissions)']).encodeFunctionData(
              'grantPermissions',
              [from, 0x04], // PERM_CAN_SEND only
            ),
            context.suite.complianceModule.address,
          );

          const result = await context.suite.complianceModule.moduleCheck(from, to, 10, context.suite.compliance.address);
          expect(result).to.be.false;
        });
      });

      describe('when receiver has PERM_CAN_RECEIVE_FROM_ACCOUNT but sender lacks PERM_CAN_SEND', () => {
        it('should return false', async () => {
          const context = await loadFixture(deployTransferRestrictFullSuite);
          const from = context.accounts.aliceWallet.address;
          const to = context.accounts.bobWallet.address;

          await context.suite.compliance.callModuleFunction(
            new ethers.utils.Interface(['function grantPermissions(address _userAddress, uint8 _permissions)']).encodeFunctionData(
              'grantPermissions',
              [to, 0x01], // PERM_CAN_RECEIVE_FROM_ACCOUNT only
            ),
            context.suite.complianceModule.address,
          );

          const result = await context.suite.complianceModule.moduleCheck(from, to, 10, context.suite.compliance.address);
          expect(result).to.be.false;
        });
      });

      describe('when neither sender nor receiver have any permissions', () => {
        it('should return false', async () => {
          const context = await loadFixture(deployTransferRestrictFullSuite);
          const from = context.accounts.aliceWallet.address;
          const to = context.accounts.bobWallet.address;

          const result = await context.suite.complianceModule.moduleCheck(from, to, 10, context.suite.compliance.address);
          expect(result).to.be.false;
        });
      });
    });
  });

  describe('.moduleMintAction', () => {
    describe('when calling from a random wallet', () => {
      it('should revert', async () => {
        const context = await loadFixture(deployTransferRestrictFullSuite);

        await expect(context.suite.complianceModule.moduleMintAction(context.accounts.anotherWallet.address, 10)).to.be.revertedWith(
          'only bound compliance can call',
        );
      });
    });

    describe('when calling as the compliance', () => {
      it('should do nothing', async () => {
        const context = await loadFixture(deployTransferRestrictFullSuite);

        await expect(
          context.suite.compliance.callModuleFunction(
            new ethers.utils.Interface(['function moduleMintAction(address, uint256)']).encodeFunctionData('moduleMintAction', [
              context.accounts.anotherWallet.address,
              10,
            ]),
            context.suite.complianceModule.address,
          ),
        ).to.eventually.be.fulfilled;
      });
    });
  });

  describe('.moduleBurnAction', () => {
    describe('when calling from a random wallet', () => {
      it('should revert', async () => {
        const context = await loadFixture(deployTransferRestrictFullSuite);

        await expect(context.suite.complianceModule.moduleBurnAction(context.accounts.anotherWallet.address, 10)).to.be.revertedWith(
          'only bound compliance can call',
        );
      });
    });

    describe('when calling as the compliance', () => {
      it('should do nothing', async () => {
        const context = await loadFixture(deployTransferRestrictFullSuite);

        await expect(
          context.suite.compliance.callModuleFunction(
            new ethers.utils.Interface(['function moduleBurnAction(address, uint256)']).encodeFunctionData('moduleBurnAction', [
              context.accounts.anotherWallet.address,
              10,
            ]),
            context.suite.complianceModule.address,
          ),
        ).to.eventually.be.fulfilled;
      });
    });
  });

  describe('.moduleTransfer', () => {
    describe('when calling from a random wallet', () => {
      it('should revert', async () => {
        const context = await loadFixture(deployTransferRestrictFullSuite);

        await expect(
          context.suite.complianceModule.moduleTransferAction(context.accounts.aliceWallet.address, context.accounts.anotherWallet.address, 10),
        ).to.be.revertedWith('only bound compliance can call');
      });
    });

    describe('when calling as the compliance', () => {
      it('should do nothing', async () => {
        const context = await loadFixture(deployTransferRestrictFullSuite);

        await expect(
          context.suite.compliance.callModuleFunction(
            new ethers.utils.Interface(['function moduleTransferAction(address _from, address _to, uint256 _value)']).encodeFunctionData(
              'moduleTransferAction',
              [context.accounts.aliceWallet.address, context.accounts.anotherWallet.address, 80],
            ),
            context.suite.complianceModule.address,
          ),
        ).to.eventually.be.fulfilled;
      });
    });
  });
});
