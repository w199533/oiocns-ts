import Cohort from '@/core/setting/SubModel/cohort';
import consts from '@/core/consts';
import Company from './company';
import Hospital from '../../setting/SubModel/hospital';
import MarketTarget from '../../setting/SubModel/mbase';
import { TargetType,companyTypes } from '../../enum';
import University from '../../setting/SubModel/university';
import { CommonStatus } from '../../enum';
import { validIsSocialCreditCode } from '../../../utils/tools';
import { ICompany, IPerson, ICohort, SpaceType,ITarget } from '../../../types/setting/itarget';
import IProduct from '../../../types/market/iproduct';
import { schema, model, kernel, common } from '../../../base';
import { ResultType, TargetModel } from '../../../base/model';
import { logger } from '../../../base/common';
export default class Person extends MarketTarget implements IPerson {
  joinedFriend: schema.XTarget[] = [];
  cohorts: ICohort[] = [];
  joinedCompany: ICompany[] = [];
  constructor(target: schema.XTarget) {
    super(target);

    this.searchTargetType = [TargetType.Cohort, TargetType.Person, ...companyTypes];
    this.subTeamTypes = [];
    this.joinTargetType = [TargetType.Person, TargetType.Cohort, ...companyTypes];
    this.createTargetType = [TargetType.Cohort, ...companyTypes];

    this.extendTargetType = [TargetType.Cohort, TargetType.Person];
  }
  async loadSubTeam(_: boolean): Promise<ITarget[]> {
    // await sleep(0);
    return [];
  }
  public get spaceData(): SpaceType {
    return {
      id: this.id,
      name: '个人空间',
      avatar: this.avatar,
      typeName: this.target.typeName as TargetType,
    };
  }
  public async create(data: TargetModel): Promise<ITarget | undefined> {
    switch (data.typeName as TargetType) {
      case TargetType.Company:
        return this.createCompany(data);
      case TargetType.Cohort:
        return this.createCohort(data.avatar, data.name, data.code, data.teamRemark);
    }
  }
  public async searchCohort(code: string): Promise<schema.XTargetArray> {
    return await this.searchTargetByName(code, [TargetType.Cohort]);
  }
  public async searchPerson(code: string): Promise<schema.XTargetArray> {
    return await this.searchTargetByName(code, [TargetType.Person]);
  }
  public async searchCompany(code: string): Promise<schema.XTargetArray> {
    return await this.searchTargetByName(code, companyTypes);
  }
  public getCohorts = async (reload?: boolean): Promise<ICohort[]> => {
    if (!reload && this.cohorts.length > 0) {
      return this.cohorts;
    }
    const res = await this.getjoinedTargets([TargetType.Cohort], this.id);
    if (res && res.result) {
      this.cohorts = res.result.map((a) => {
        return new Cohort(a);
      });
    }
    return this.cohorts;
  };
  public async getJoinedCompanys(reload: boolean = false): Promise<ICompany[]> {
    if (!reload && this.joinedCompany.length > 0) {
      return this.joinedCompany;
    }
    const res = await this.getjoinedTargets(companyTypes, this.id);
    if (res && res.result) {
      this.joinedCompany = res.result.map((a) => {
        let company;
        switch (a.typeName) {
          case TargetType.University:
            company = new University(a, this.id);
            break;
          case TargetType.Hospital:
            company = new Hospital(a, this.id);
            break;
          default:
            company = new Company(a, this.id);
            break;
        }
        return company;
      });
    }
    return this.joinedCompany;
  }
  public async createCohort(
    avatar: string,
    name: string,
    code: string,
    remark: string,
  ): Promise<ICohort | undefined> {
    const res = await this.createTarget({
      code,
      name,
      avatar,
      teamCode: code,
      teamName: name,
      belongId: this.id,
      typeName: TargetType.Cohort,
      teamRemark: remark,
    });
    if (res.success && res.data != undefined) {
      const cohort = new Cohort(res.data);
      this.cohorts.push(cohort);
      cohort.pullMember(this.target);
      return cohort;
    }
  }
  public async createCompany(
    data: Omit<TargetModel, 'id'>,
  ): Promise<ICompany | undefined> {
    data.belongId = this.id;
    if (!companyTypes.includes(<TargetType>data.typeName)) {
      logger.warn('您无法创建该类型单位!');
      return;
    }
    if (!validIsSocialCreditCode(data.code)) {
      logger.warn('请填写正确的代码!');
      return;
    }
    const tres = await this.searchTargetByName(data.code, companyTypes);
    if (!tres.result) {
      const res = await this.createTarget(data);
      if (res.success && res.data != undefined) {
        let company;
        switch (<TargetType>data.typeName) {
          case TargetType.University:
            company = new University(res.data, this.id);
            break;
          case TargetType.Hospital:
            company = new Hospital(res.data, this.id);
            break;
          default:
            company = new Company(res.data, this.id);
            break;
        }
        this.joinedCompany.push(company);
        company.pullMember(this.target);
        return company;
      }
    } else {
      logger.warn(consts.IsExistError);
    }
  }
  public async createProduct(
    data: Omit<model.ProductModel, 'id' | 'belongId'>,
  ): Promise<IProduct | undefined> {
    const prod = await super.createProduct(data);
    if (prod) {
      this.usefulProduct.push(prod.prod);
      if (prod.prod.resource) {
        this.usefulResource.set(prod.prod.id, prod.prod.resource);
      }
    }
    return prod;
  }
  public async deleteCohort(id: string): Promise<boolean> {
    let res = await kernel.deleteTarget({
      id: id,
      typeName: TargetType.Cohort,
      belongId: this.id,
    });
    if (res.success) {
      this.cohorts = this.cohorts.filter((a) => a.id != id);
    }
    return res.success;
  }
  public async deleteCompany(id: string): Promise<boolean> {
    let res = await kernel.deleteTarget({
      id: id,
      typeName: TargetType.Company,
      belongId: this.id,
    });
    if (res.success) {
      this.joinedCompany = this.joinedCompany.filter((a) => a.id != id);
    }
    return res.success;
  }
  public async applyJoinCohort(id: string): Promise<boolean> {
    const cohort = this.cohorts.find((cohort) => {
      return cohort.id == id;
    });
    if (!cohort) {
      return await this.applyJoin(id, TargetType.Cohort);
    }
    logger.warn(consts.IsJoinedError);
    return false;
  }
  public async applyJoinCompany(id: string, typeName: TargetType): Promise<boolean> {
    const company = this.joinedCompany.find((company) => {
      return company.id == id;
    });
    if (!company) {
      return await this.applyJoin(id, typeName);
    }
    logger.warn(consts.IsJoinedError);
    return false;
  }
  public async quitCohorts(id: string): Promise<boolean> {
    const res = await this.cancelJoinTeam(id);
    if (res.success) {
      this.cohorts = this.cohorts.filter((cohort) => {
        return cohort.id != id;
      });
    }
    return res.success;
  }
  public async quitCompany(id: string): Promise<boolean> {
    const res = await kernel.exitAnyOfTeamAndBelong({
      id,
      teamTypes: [
        TargetType.JobCohort,
        TargetType.Department,
        TargetType.Cohort,
        ...companyTypes,
      ],
      targetId: this.id,
      targetType: TargetType.Person,
    });
    if (res.success) {
      this.joinedCompany = this.joinedCompany.filter((company) => {
        return company.id != id;
      });
    }
    return res.success;
  }
  public async getFriends(reload: boolean = false): Promise<schema.XTarget[]> {
    if (!reload && this.joinedFriend.length > 0) {
      return this.joinedFriend;
    }
    const res = await this.getSubTargets([TargetType.Person]);
    if (res.success && res.data.result) {
      this.joinedFriend = res.data.result;
    }

    return this.joinedFriend;
  }
  public async applyFriend(target: schema.XTarget): Promise<boolean> {
    const joinedTarget = this.joinedFriend.find((a) => {
      return a.id == target.id;
    });
    if (joinedTarget == undefined) {
      if (await this.pullMember(target)) {
        return await this.applyJoin(target.id, TargetType.Person);
      }
    }
    logger.warn(consts.IsExistError);
    return false;
  }
  public async removeFriend(ids: string[]): Promise<boolean> {
    if (await this.removeMembers(ids, TargetType.Person)) {
      ids.forEach(async (id) => {
        await kernel.exitAnyOfTeam({
          id,
          teamTypes: [TargetType.Person],
          targetId: this.id,
          targetType: TargetType.Person,
        });
      });
      this.joinedFriend = this.joinedFriend.filter((item) => {
        return !ids.includes(item.id);
      });
      return true;
    }
    return false;
  }
  public async approvalFriendApply(
    relation: schema.XRelation,
    status: number,
  ): Promise<boolean> {
    const res = await this.approvalJoinApply(relation.id, status);
    if (
      status >= CommonStatus.ApproveStartStatus &&
      status < CommonStatus.RejectStartStatus &&
      res.success &&
      relation.target != undefined
    ) {
      this.joinedFriend.push(relation.target);
    }
    return false;
  }
  public async queryJoinApply(): Promise<schema.XRelationArray> {
    const res = await kernel.queryJoinTeamApply({
      id: this.id,
      page: {
        offset: 0,
        filter: '',
        limit: common.Constants.MAX_UINT_16,
      },
    });
    return res.data;
  }
  public async queryJoinApproval(): Promise<schema.XRelationArray> {
    const res = await kernel.queryTeamJoinApproval({
      id: this.id,
      page: {
        offset: 0,
        filter: '',
        limit: common.Constants.MAX_UINT_16,
      },
    });
    return res.data;
  }
  public async cancelJoinApply(id: string): Promise<boolean> {
    const res = await kernel.cancelJoinTeam({
      id,
      typeName: TargetType.Person,
      belongId: this.id,
    });
    return res.success;
  }
  public async resetPassword(password: string, privateKey: string): Promise<boolean> {
    const res = await kernel.resetPassword(this.target.code, password, privateKey);
    return res.success;
  }
}
